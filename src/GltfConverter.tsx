import * as THREE from 'three'
import { useState, useEffect, type DragEvent } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

type ParsedSpline = {
  name: string
  points: number[][]
  closed: boolean
  tension: number
  transform: {
    position: THREE.Vector3
    rotation: THREE.Euler
    scale: THREE.Vector3
  }
}

type GenerateSettings = {
  useSourceImport: boolean
  modelPath: string
  componentPath: string
  useOwnGeoColliders: boolean
  animations?: Array<{ name: string }>
  splines?: ParsedSpline[]
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function GltfConverter() {
    // State
    const [jsxOutput, setJsxOutput] = useState<string>('')
    const [error, setError] = useState<string | null>(null)
    const [fileName, setFileName] = useState<string>('')
    const [fileData, setFileData] = useState<ArrayBuffer | null>(null)       // raw binary for save
    const [glbData, setGlbData] = useState<ArrayBuffer | null>(null)         // converted GLB (from FBX)
    const [parsedScene, setParsedScene] = useState<THREE.Object3D | null>(null)
    const [parsedAnimations, setParsedAnimations] = useState<THREE.AnimationClip[]>([])
    const [parsedSplines, setParsedSplines] = useState<ParsedSpline[]>([])
    const [isFbxSource, setIsFbxSource] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)

    // Settings - Default to Source Import implies src/ folder usage
    const [useSourceImport, setUseSourceImport] = useState(true)
    const [modelPath, setModelPath] = useState('/models/')
    const [componentPath, setComponentPath] = useState('../../SceneComponents')
    const [useOwnGeoColliders, setUseOwnGeoColliders] = useState(true)

    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [conflictName, setConflictName] = useState('')
    const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)

    // Load saved handle on mount
    useEffect(() => {
        getDirectoryHandle().then((handle) => {
            if (handle) {
                console.log("Restored directory handle")
                setDirHandle(handle)
            }
        }).catch((err: unknown) => console.log("DB Error", err))
    }, [])

    const processGlb = (arrayBuffer: ArrayBuffer, originalFileName: string) => {
        setIsProcessing(true)
        setError(null)

        try {
            const loader = new GLTFLoader()
            const dracoLoader = new DRACOLoader()
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
            loader.setDRACOLoader(dracoLoader)

            loader.parse(arrayBuffer, '', (gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) => {
                try {
                    const glbFileName = originalFileName.replace(/\.(glb|gltf)$/, '.glb')
                    const generatedJsx = generateJsxFromScene(gltf.scene, glbFileName, {
                        useSourceImport, modelPath, componentPath,
                        useOwnGeoColliders,
                        animations: gltf.animations || [],
                        splines: [],
                    })
                    setJsxOutput(generatedJsx)
                    setParsedScene(gltf.scene)
                    setParsedAnimations(gltf.animations || [])
                    setParsedSplines([])
                    setIsFbxSource(false)
                    setIsProcessing(false)
                } catch (innerErr: unknown) {
                    console.error("Generator error:", innerErr)
                    setError("Error generating TSX: " + toErrorMessage(innerErr))
                    setIsProcessing(false)
                }
            }, (err: unknown) => {
                console.error("Parse error:", err)
                setError("Failed to parse file. Check console (Draco decoder might be blocked?).")
                setIsProcessing(false)
            })
        } catch (e: unknown) {
            setError(toErrorMessage(e))
            setIsProcessing(false)
        }
    }

    const processFbx = async (arrayBuffer: ArrayBuffer, originalFileName: string) => {
        setIsProcessing(true)
        setError(null)

        try {
            const loader = new FBXLoader()
            const fbxScene = loader.parse(arrayBuffer, '')

            // --- Extrahera splines (THREE.Line med NurbsCurve-geometri) ---
            const splines: ParsedSpline[] = []

            fbxScene.traverse((child: any) => {
                // FBXLoader skapar Line-objekt från NurbsCurve
                if (child.isLine) {
                    const geo = child.geometry
                    const posAttr = geo.getAttribute('position')
                    if (posAttr) {
                        const points: number[][] = []
                        for (let i = 0; i < posAttr.count; i++) {
                            points.push([
                                parseFloat(posAttr.getX(i).toFixed(4)),
                                parseFloat(posAttr.getY(i).toFixed(4)),
                                parseFloat(posAttr.getZ(i).toFixed(4)),
                            ])
                        }
                        const originalName = child.userData?.originalName || child.name || 'Spline'
                        // Kolla om spline är closed (sista punkt ≈ första punkt)
                        const first = points[0]
                        const last = points[points.length - 1]
                        const closed = first && last &&
                            Math.abs(first[0] - last[0]) < 0.001 &&
                            Math.abs(first[1] - last[1]) < 0.001 &&
                            Math.abs(first[2] - last[2]) < 0.001
                        // Om den är closed, ta bort sista duplicerade punkten
                        if (closed) points.pop()

                        const isLinear = originalName.toLowerCase().includes('_splinelinear')

                        splines.push({
                            name: originalName,
                            points,
                            closed,
                            tension: isLinear ? 0 : 0.5,
                            transform: {
                                position: child.position.clone(),
                                rotation: child.rotation.clone(),
                                scale: child.scale.clone(),
                            }
                        })
                    }
                }
            })

            // --- Bygg en ren scene för GLB-export (bara meshes, inga Lines) ---
            // Klona hela scenen men markera lines för borttagning
            const clonedScene = fbxScene.clone(true)
            const linesToRemove: THREE.Object3D[] = []
            clonedScene.traverse((child: any) => {
                if (child.isLine) linesToRemove.push(child)
            })
            linesToRemove.forEach((line) => line.parent?.remove(line))

            // --- Extrahera animationer ---
            const animations = fbxScene.animations || []

            // --- Exportera till GLB ---
            const exporter = new GLTFExporter()
            const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                exporter.parse(clonedScene, (result: unknown) => {
                    if (result instanceof ArrayBuffer) {
                        resolve(result)
                    } else {
                        reject(new Error('GLTFExporter did not return an ArrayBuffer in binary mode.'))
                    }
                }, (err: unknown) => reject(err), {
                    binary: true,
                    animations: animations,
                })
            })

            // --- Generera TSX ---
            const glbFileName = originalFileName.replace(/\.fbx$/i, '.glb')

            // Ladda GLB:en med GLTFLoader för att få korrekt scene-hierarki
            const gltfLoader = new GLTFLoader()
            const dracoLoader = new DRACOLoader()
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
            gltfLoader.setDRACOLoader(dracoLoader)

            gltfLoader.parse(glbBuffer, '', (gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }) => {
                try {
                    const generatedJsx = generateJsxFromScene(gltf.scene, glbFileName, {
                        useSourceImport, modelPath, componentPath,
                        useOwnGeoColliders,
                        animations: gltf.animations || [],
                        splines,
                    })
                    setJsxOutput(generatedJsx)
                    setParsedScene(gltf.scene)
                    setParsedAnimations(gltf.animations || [])
                    setParsedSplines(splines)
                    setGlbData(glbBuffer)
                    setIsFbxSource(true)
                    setIsProcessing(false)
                } catch (innerErr: unknown) {
                    console.error("TSX generator error:", innerErr)
                    setError("Error generating TSX: " + toErrorMessage(innerErr))
                    setIsProcessing(false)
                }
            }, (err: unknown) => {
                console.error("GLB re-parse error:", err)
                setError("Failed to re-parse converted GLB: " + toErrorMessage(err))
                setIsProcessing(false)
            })

        } catch (e: unknown) {
            console.error("FBX processing error:", e)
            setError("FBX Error: " + toErrorMessage(e))
            setIsProcessing(false)
        }
    }

    const onFileDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (!file) return

        const isFbx = file.name.toLowerCase().endsWith('.fbx')
        const isGltf = file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')

        if (!isFbx && !isGltf) {
            setError("Släpp en .fbx, .glb eller .gltf fil")
            return
        }

        setFileName(file.name)
        setError(null)
        setJsxOutput('')
        setParsedScene(null)
        setParsedAnimations([])
        setParsedSplines([])
        setGlbData(null)
        setIsProcessing(true)

        const reader = new FileReader()
        reader.onload = (event: ProgressEvent<FileReader>) => {
            const result = event.target?.result
            if (!(result instanceof ArrayBuffer)) {
                setError('Failed to read file as ArrayBuffer.')
                setIsProcessing(false)
                return
            }

            setFileData(result)
            if (isFbx) {
                processFbx(result, file.name)
            } else {
                processGlb(result, file.name)
            }
        }
        reader.readAsArrayBuffer(file)
    }

    // --- SAVE LOGIC ---

    const handleSaveToProject = async () => {
        if (!window.showDirectoryPicker) {
            alert("Your browser doesn't support the File System Access API. Please use Chrome or Edge.")
            return
        }

        try {
            let handle: FileSystemDirectoryHandle | null = dirHandle

            if (handle) {
                const permissionTarget = handle as unknown as {
                    queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
                    requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
                }
                const opts = { mode: 'readwrite' as const }
                if (permissionTarget.queryPermission && (await permissionTarget.queryPermission(opts)) !== 'granted') {
                    if (permissionTarget.requestPermission && (await permissionTarget.requestPermission(opts)) !== 'granted') {
                        handle = null
                    }
                }
            }

            if (!handle) {
                handle = await window.showDirectoryPicker({
                    id: 'models_folder',
                    mode: 'readwrite'
                })
                setDirHandle(handle)
                saveDirectoryHandle(handle)
            }

            // Alla sparas som .glb (FBX konverteras)
            const baseName = fileName.replace(/\.(glb|gltf|fbx)$/i, '')
            const glbName = baseName + '.glb'
            const jsxName = toPascalCase(baseName) + '.tsx'

            const conflict = (await fileExists(handle, jsxName)) || (await fileExists(handle, glbName))

            if (conflict) {
                setConflictName(baseName)
                setShowModal(true)
            } else {
                await performSave(handle, baseName, false)
            }

        } catch (e: unknown) {
            if (!(e instanceof Error) || e.name !== 'AbortError') setError(toErrorMessage(e))
        }
    }

    const performSave = async (handle: FileSystemDirectoryHandle, baseName: string, increment: boolean) => {
        let finalGlbName = baseName + '.glb'
        let finalJsxName = toPascalCase(baseName) + '.tsx'

        if (increment) {
            let counter = 1
            let found = true
            while (found) {
                const testBase = `${baseName}${counter}`
                const testGlb = `${testBase}.glb`
                const testJsx = `${toPascalCase(testBase)}.tsx`

                const testGlbExists = await fileExists(handle, testGlb)
                const testJsxExists = await fileExists(handle, testJsx)
                if (!testGlbExists && !testJsxExists) {
                    found = false
                    finalGlbName = testGlb
                    finalJsxName = testJsx
                }
                if (found) counter++
            }
        }

        // Regenerera TSX med rätt filnamn
        if (!parsedScene) {
            setError('No parsed scene available to save.')
            return
        }

        const newJsx = generateJsxFromScene(parsedScene, finalGlbName, {
            useSourceImport, modelPath, componentPath,
            useOwnGeoColliders,
            animations: parsedAnimations,
            splines: parsedSplines,
        })

        // Välj rätt binär-data: FBX → använd konverterad GLB, annars original
        const modelData = isFbxSource ? glbData : fileData
        if (!modelData) {
            setError('No model data available to write.')
            return
        }

        try {
            const modelHandle = await handle.getFileHandle(finalGlbName, { create: true })
            const modelWritable = await modelHandle.createWritable()
            await modelWritable.write(modelData)
            await modelWritable.close()

            const jsxHandle = await handle.getFileHandle(finalJsxName, { create: true })
            const jsxWritable = await jsxHandle.createWritable()
            await jsxWritable.write(newJsx)
            await jsxWritable.close()

            alert(`Saved ${finalGlbName} and ${finalJsxName}!`)
            setShowModal(false)
        } catch (e: unknown) {
            setError("Write failed: " + toErrorMessage(e))
            setShowModal(false)
        }
    }

    const copyToClipboard = () => {
        navigator.clipboard.writeText(jsxOutput)
        alert("Copied to clipboard!")
    }

    // --- UI RENDER ---

    return (
        <div
            style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                background: '#222', color: '#fff', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 40,
                fontFamily: 'Inter, system-ui, sans-serif'
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onFileDrop}
        >
            <h1 style={{ marginBottom: 10 }}>C4D to R3F Converter 🛠️</h1>

            {/* Settings Panel */}
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 15, width: '100%', maxWidth: 400, background: '#333', padding: 20, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                            type="checkbox"
                            checked={useSourceImport}
                            onChange={(e) => {
                                setUseSourceImport(e.target.checked)
                                setComponentPath(e.target.checked ? '../../SceneComponents' : '../SceneComponents')
                            }}
                            style={{ width: 18, height: 18 }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 'bold' }}>Target: Source Folder (src/)</span>
                            <span style={{ fontSize: 11, opacity: 0.6 }}>Best for <code>src/assets/models/</code>. Generates <code>import</code>.</span>
                        </div>
                    </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                            type="checkbox"
                            checked={useOwnGeoColliders}
                            onChange={(e) => setUseOwnGeoColliders(e.target.checked)}
                            style={{ width: 18, height: 18 }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 'bold' }}>Use Own Geo For `_collider`</span>
                            <span style={{ fontSize: 11, opacity: 0.6 }}>
                                Om ett physics-objekt har <code>_collider</code>: använd dess egen mesh som collider. För grupper utan geo används en enkel omslutande <code>CuboidCollider</code>.
                            </span>
                        </div>
                    </label>
                </div>

                {!useSourceImport && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label style={{ fontSize: 11, opacity: 0.7 }}>Public Folder Path</label>
                        <input
                            type="text"
                            value={modelPath}
                            onChange={(e) => setModelPath(e.target.value)}
                            placeholder="/models/"
                            style={{ background: '#222', border: '1px solid #555', padding: 8, color: '#fff' }}
                        />
                    </div>
                )}
            </div>

            <p style={{ opacity: 0.7, maxWidth: 600, textAlign: 'center' }}>
                {isProcessing ? (
                    <span style={{ color: '#4dff88', fontWeight: 'bold' }}>Processing... ⏳</span>
                ) : (
                    <span>
                        Drag & Drop <code>.fbx</code>, <code>.glb</code> eller <code>.gltf</code>.<br />
                        FBX konverteras till GLB automatiskt. Klicka <strong>SAVE</strong> för att spara.
                    </span>
                )}
            </p>

            {/* Output Area */}
            {jsxOutput && !isProcessing && (
                <div style={{ width: '80%', height: '50%', marginTop: 20, position: 'relative' }}>
                    <textarea
                        value={jsxOutput}
                        readOnly
                        style={{
                            width: '100%', height: '100%', background: '#111', color: '#aaffaa',
                            fontFamily: 'monospace', padding: 20, border: '1px solid #444',
                            borderRadius: 8, resize: 'none'
                        }}
                    />
                    <div style={{ position: 'absolute', top: 15, right: 15, display: 'flex', gap: 10 }}>
                        <button
                            onClick={copyToClipboard}
                            style={{ padding: '8px 16px', background: '#fff', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: 4 }}
                        >
                            COPY TSX
                        </button>
                        <button
                            onClick={handleSaveToProject}
                            style={{ padding: '8px 16px', background: '#4dff88', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: 4 }}
                        >
                            SAVE TO PROJECT 💾
                        </button>
                    </div>
                </div>
            )}

            {/* Helper Error */}
            {error && <p style={{ marginTop: 20, color: '#ff5555' }}>{error}</p>}

            {/* CONFLICT MODAL */}
            {showModal && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
                }}>
                    <div style={{ background: '#333', padding: 30, borderRadius: 8, maxWidth: 400, textAlign: 'center' }}>
                        <h3 style={{ marginTop: 0 }}>File already exists! ⚠️</h3>
                        <p>A file with the name <strong>{conflictName}</strong> already exists in the selected folder.</p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
                            <button
                                onClick={() => {
                                    if (dirHandle) void performSave(dirHandle, conflictName, false)
                                }}
                                style={{ padding: '10px 20px', background: '#ff5555', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                            >
                                Overwrite
                            </button>
                            <button
                                onClick={() => {
                                    if (dirHandle) void performSave(dirHandle, conflictName, true)
                                }}
                                style={{ padding: '10px 20px', background: '#4dff88', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                            >
                                Increment Name (e.g. {conflictName}1)
                            </button>
                        </div>
                        <button
                            onClick={() => setShowModal(false)}
                            style={{ marginTop: 15, background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// --- HELPER FUNCTIONS ---

function sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '').replace(/_+$/, '')
}

function toPascalCase(str: string): string {
    const result = sanitizeName(str)
    return result.charAt(0).toUpperCase() + result.slice(1)
}

function getTransformProps(obj: any): string {
    const p = obj.position
    const r = obj.rotation
    const s = obj.scale
    let str = ''
    if (Math.abs(p.x) > 0.0001 || Math.abs(p.y) > 0.0001 || Math.abs(p.z) > 0.0001) str += ` position={[${parseFloat(p.x.toFixed(4))}, ${parseFloat(p.y.toFixed(4))}, ${parseFloat(p.z.toFixed(4))}]}`
    if (Math.abs(r.x) > 0.0001 || Math.abs(r.y) > 0.0001 || Math.abs(r.z) > 0.0001) str += ` rotation={[${parseFloat(r.x.toFixed(4))}, ${parseFloat(r.y.toFixed(4))}, ${parseFloat(r.z.toFixed(4))}]}`
    if (Math.abs(s.x - 1) > 0.0001 || Math.abs(s.y - 1) > 0.0001 || Math.abs(s.z - 1) > 0.0001) str += ` scale={[${parseFloat(s.x.toFixed(4))}, ${parseFloat(s.y.toFixed(4))}, ${parseFloat(s.z.toFixed(4))}]}`
    return str
}

function getLocalBoundsForObject(obj: THREE.Object3D): { center: THREE.Vector3; size: THREE.Vector3 } | null {
    const bounds = new THREE.Box3()
    const inverseRootWorld = new THREE.Matrix4().copy(obj.matrixWorld).invert()
    const localMatrix = new THREE.Matrix4()
    const corner = new THREE.Vector3()
    let hasGeometry = false

    const addCorner = (x: number, y: number, z: number) => {
        corner.set(x, y, z).applyMatrix4(localMatrix)
        bounds.expandByPoint(corner)
        hasGeometry = true
    }

    obj.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh || !mesh.geometry) return

        const geometry = mesh.geometry as THREE.BufferGeometry
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        if (!geometry.boundingBox) return

        localMatrix.multiplyMatrices(inverseRootWorld, mesh.matrixWorld)

        const { min, max } = geometry.boundingBox
        addCorner(min.x, min.y, min.z)
        addCorner(min.x, min.y, max.z)
        addCorner(min.x, max.y, min.z)
        addCorner(min.x, max.y, max.z)
        addCorner(max.x, min.y, min.z)
        addCorner(max.x, min.y, max.z)
        addCorner(max.x, max.y, min.z)
        addCorner(max.x, max.y, max.z)
    })

    if (!hasGeometry || bounds.isEmpty()) return null

    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    return { center, size }
}

function generateJsxFromScene(scene: THREE.Object3D, originalFileName: string, settings: GenerateSettings): string {
    const { useSourceImport, modelPath, componentPath, useOwnGeoColliders, animations = [], splines = [] } = settings
    const baseName = originalFileName.replace(/\.(glb|gltf)$/, '')
    const componentName = toPascalCase(baseName || 'Model')
    scene.updateMatrixWorld(true)

    let loadPathStr = ''
    let importStr = ''
    if (useSourceImport) {
        importStr = `import modelUrl from './${originalFileName}?url'`
        loadPathStr = 'modelUrl'
    } else {
        const cleanPath = modelPath.endsWith('/') ? modelPath : modelPath + '/'
        loadPathStr = `'${cleanPath}${originalFileName}'`
    }

    // Filtrera bort CINEMA_4D_Main-taken (rest position)
    const selectableAnims = animations.filter((a) => a.name !== 'CINEMA_4D_Main')
    const hasAnimations = selectableAnims.length > 0
    const hasSplines = splines.length > 0

    // --- Steg 1: Samla unika _color-tokens från hela scenen ---
    const colorSet = new Set<string>()

    function collectColors(obj: any): void {
        const colorMatch = obj.name.match(/_color([A-Za-z0-9]+)/)
        if (colorMatch) colorSet.add(colorMatch[1].toLowerCase())
        obj.children.forEach((child: any) => collectColors(child))
    }
    scene.children.forEach((child) => collectColors(child))

    if (colorSet.size === 0) colorSet.add('default')

    function getColorFromName(name: string): string | null {
        const match = name.match(/_color([A-Za-z0-9]+)/)
        return match ? match[1].toLowerCase() : null
    }

    function hasSingleTone(name: string): boolean {
        return name.toLowerCase().includes('_singletone')
    }

    let usesRigidBody = false
    let usesConvexHullCollider = false
    let usesCuboidCollider = false

    // --- Steg 2: Bygg output ---
    let output = `/*\nAuto-generated by C4D to R3F Converter\nModel: ${originalFileName}\n*/\n\n`
    output += `import * as THREE from 'three'\n`
    output += `import { useRef, useEffect } from 'react'\n`
    output += `import { useGLTF${hasAnimations ? ', useAnimations' : ''} } from '@react-three/drei'\n`
    output += `__RAPIER_IMPORT__\n`
    output += `import type { ThreeElements } from '@react-three/fiber'\n`
    output += `import { C4DMesh, C4DMaterial${hasSplines ? ', SplineElement' : ''} } from '${componentPath}'\n`
    output += `import type { PaletteName } from '../../GameSettings'\n`
    if (importStr) output += `${importStr}\n`
    output += `\n`

    output += `type ${componentName}Props = ThreeElements['group'] & {\n`
    output += `  animation?: string | null\n`
    output += `  fadeDuration?: number\n`
    output += `}\n\n`

    // Komponent-signatur med animation-props
    if (hasAnimations) {
        output += `export function ${componentName}({ animation = null, fadeDuration = 0.3, ...props }: ${componentName}Props) {\n`
    } else {
        output += `export function ${componentName}(props: ${componentName}Props) {\n`
    }

    // Refs och hooks
    if (hasAnimations) {
        output += `  const group = useRef<THREE.Group | null>(null)\n`
        output += `  const { nodes, animations } = useGLTF(${loadPathStr}) as unknown as { nodes: Record<string, THREE.Mesh>; animations: THREE.AnimationClip[] }\n`
        output += `  const { actions } = useAnimations(animations, group)\n\n`

        // Crossfade-logik
        output += `  // Crossfade mellan animationer\n`
        output += `  // animation={null} = rest position, animation="${selectableAnims[0]?.name || 'Anim1'}" = spela\n`
        output += `  useEffect(() => {\n`
        output += `    Object.values(actions).forEach((a) => a?.fadeOut(fadeDuration))\n`
        output += `    if (animation && actions[animation]) {\n`
        output += `      actions[animation].reset().fadeIn(fadeDuration).play()\n`
        output += `    }\n`
        output += `  }, [animation, fadeDuration, actions])\n\n`

        // Kommentar med tillgängliga animationer
        output += `  // Tillgängliga animationer: ${selectableAnims.map(a => `"${a.name}"`).join(', ')}\n\n`
    } else {
        output += `  const { nodes } = useGLTF(${loadPathStr}) as unknown as { nodes: Record<string, THREE.Mesh> }\n`
    }

    // Colors-objekt
    output += `  const colors: Record<string, PaletteName> = {\n`
    output += `    default: 'default',\n`
    colorSet.forEach((colorName) => {
        output += `    ${colorName}: '${colorName}',\n`
    })
    output += `  }\n\n`

    output += `  return (\n`
    if (hasAnimations) {
        output += `    <group ref={group} {...props} dispose={null}>\n`
    } else {
        output += `    <group {...props} dispose={null}>\n`
    }

    function traverse(obj: any, indent = 6, inheritedColor: string | null = null): string {
        let str = ''
        const spaces = ' '.repeat(indent)
        if (obj.userData?.ignore) return ''

        const rawName = obj.name
        const safeName = sanitizeName(rawName)
        const transformProps = getTransformProps(obj)

        const ownColor = getColorFromName(rawName)
        const currentColor = ownColor || inheritedColor || 'default'
        const singleTone = hasSingleTone(rawName)

        if (!colorSet.has(currentColor)) colorSet.add(currentColor)

        let physicsType: string | null = null
        let physicsProps = ''
        if (rawName.includes('_dynamic')) physicsType = 'dynamic'
        if (rawName.includes('_static') || rawName.includes('_fixed')) physicsType = 'fixed'
        if (rawName.includes('_kinematic')) physicsType = 'kinematicPosition'
        const massMatch = rawName.match(/_mass([\d.]+)/)
        if (massMatch) physicsProps += ` mass={${massMatch[1]}}`
        const fricMatch = rawName.match(/_fric([\d.]+)/)
        if (fricMatch) physicsProps += ` friction={${fricMatch[1]}}`
        if (rawName.includes('_lockRot')) physicsProps += ` lockRotations`
        if (rawName.includes('_sensor')) physicsProps += ` sensor`

        const isColliderName = (name: string): boolean => name.toLowerCase().includes('_collider')
        const isSelfCollider = isColliderName(rawName)
        const colliderChildren = obj.children.filter((c: any) => isColliderName(c.name))
        const explicitColliderMeshes = colliderChildren.filter((c: any) => Boolean(c.geometry))
        const visualChildren = obj.children.filter((c: any) => !isColliderName(c.name))

        const singleToneProp = singleTone ? ' singleTone' : ''

        if (physicsType) {
            usesRigidBody = true

            const useSelfMeshCollider = useOwnGeoColliders
                && isSelfCollider
                && obj.isMesh
                && Boolean(obj.geometry)
                && explicitColliderMeshes.length === 0

            const useFallbackCuboidCollider = useOwnGeoColliders
                && isSelfCollider
                && !useSelfMeshCollider
                && explicitColliderMeshes.length === 0

            const fallbackBounds = useFallbackCuboidCollider ? getLocalBoundsForObject(obj) : null
            const hasFallbackCollider = Boolean(fallbackBounds && fallbackBounds.size.lengthSq() > 0.0000001)

            const hasExplicitColliders = explicitColliderMeshes.length > 0
            const disableAutoColliders = hasExplicitColliders || useSelfMeshCollider || hasFallbackCollider
            const collidersAttr = disableAutoColliders ? ' colliders={false}' : ''

            str += `${spaces}<RigidBody type="${physicsType}"${collidersAttr}${physicsProps}${transformProps}>\n`

            if (hasExplicitColliders) {
                explicitColliderMeshes.forEach((c: any) => {
                    const cSafeName = sanitizeName(c.name)
                    const colliderTransform = getTransformProps(c)
                    str += `${spaces}  <ConvexHullCollider args={[nodes['${cSafeName}'].geometry.attributes.position.array]}${colliderTransform} />\n`
                    usesConvexHullCollider = true
                })
            }

            if (useSelfMeshCollider) {
                str += `${spaces}  <ConvexHullCollider args={[nodes['${safeName}'].geometry.attributes.position.array]} />\n`
                usesConvexHullCollider = true
            } else if (hasFallbackCollider && fallbackBounds) {
                const halfX = Math.max(parseFloat((fallbackBounds.size.x * 0.5).toFixed(4)), 0.001)
                const halfY = Math.max(parseFloat((fallbackBounds.size.y * 0.5).toFixed(4)), 0.001)
                const halfZ = Math.max(parseFloat((fallbackBounds.size.z * 0.5).toFixed(4)), 0.001)
                const center = fallbackBounds.center
                let cuboidTransform = ''
                if (Math.abs(center.x) > 0.0001 || Math.abs(center.y) > 0.0001 || Math.abs(center.z) > 0.0001) {
                    cuboidTransform = ` position={[${parseFloat(center.x.toFixed(4))}, ${parseFloat(center.y.toFixed(4))}, ${parseFloat(center.z.toFixed(4))}]}`
                }
                str += `${spaces}  <CuboidCollider args={[${halfX}, ${halfY}, ${halfZ}]}${cuboidTransform} />\n`
                usesCuboidCollider = true
            }

            const shouldRenderOwnColliderMesh = useSelfMeshCollider

            if (obj.isMesh && (!isSelfCollider || shouldRenderOwnColliderMesh)) {
                str += `${spaces}  <C4DMesh name={nodes['${safeName}'].name} geometry={nodes['${safeName}'].geometry} castShadow receiveShadow>\n`
                str += `${spaces}    <C4DMaterial color={colors.${currentColor}}${singleToneProp} />\n`
                visualChildren.forEach((child: any) => str += traverse(child, indent + 4, currentColor))
                str += `${spaces}  </C4DMesh>\n`
            } else {
                visualChildren.forEach((child: any) => str += traverse(child, indent + 2, currentColor))
            }
            str += `${spaces}</RigidBody>\n`
        } else if (obj.isMesh && !isSelfCollider) {
            str += `${spaces}<C4DMesh name={nodes['${safeName}'].name} geometry={nodes['${safeName}'].geometry} castShadow receiveShadow${transformProps}>\n`
            str += `${spaces}  <C4DMaterial color={colors.${currentColor}}${singleToneProp} />\n`
            visualChildren.forEach((child: any) => str += traverse(child, indent + 2, currentColor))
            str += `${spaces}</C4DMesh>\n`
        } else if (!rawName.toLowerCase().includes('_collider')) {
            if (transformProps) {
                str += `${spaces}<group name={${JSON.stringify(rawName)}}${transformProps}>\n`
                visualChildren.forEach((child: any) => str += traverse(child, indent + 2, currentColor))
                str += `${spaces}</group>\n`
            } else {
                visualChildren.forEach((child: any) => str += traverse(child, indent, currentColor))
            }
        }

        return str
    }

    scene.children.forEach((child) => output += traverse(child))

    const rapierImports: string[] = []
    if (usesRigidBody) {
        rapierImports.push('RigidBody')
        if (usesConvexHullCollider) rapierImports.push('ConvexHullCollider')
        if (usesCuboidCollider) rapierImports.push('CuboidCollider')
    }
    const rapierImportLine = rapierImports.length > 0
        ? `import { ${rapierImports.join(', ')} } from '@react-three/rapier'`
        : ''
    output = output.replace('__RAPIER_IMPORT__', rapierImportLine)

    // --- Lägg till splines ---
    if (hasSplines) {
        output += `\n      {/* Splines */}\n`
        splines.forEach((spline) => {
            const cleanName = spline.name.split('\u0000')[0].trim() // Ta bort FBX null-suffix
            const tp = spline.transform
            let splineProps = ''

            // Position
            if (tp && (Math.abs(tp.position.x) > 0.0001 || Math.abs(tp.position.y) > 0.0001 || Math.abs(tp.position.z) > 0.0001)) {
                splineProps += `\n        position={[${parseFloat(tp.position.x.toFixed(4))}, ${parseFloat(tp.position.y.toFixed(4))}, ${parseFloat(tp.position.z.toFixed(4))}]}`
            }

            // Rotation
            if (tp && (Math.abs(tp.rotation.x) > 0.0001 || Math.abs(tp.rotation.y) > 0.0001 || Math.abs(tp.rotation.z) > 0.0001)) {
                splineProps += `\n        rotation={[${parseFloat(tp.rotation.x.toFixed(4))}, ${parseFloat(tp.rotation.y.toFixed(4))}, ${parseFloat(tp.rotation.z.toFixed(4))}]}`
            }

            output += `      {/* ${cleanName} */}\n`
            output += `      <SplineElement\n`
            output += `        points={${JSON.stringify(spline.points)}}\n`
            output += `        closed={${spline.closed}}\n`
            output += `        tension={${spline.tension}}\n`
            output += `        curveType="catmullrom"${splineProps}\n`
            output += `      />\n`
        })
    }

    output += `    </group>\n`
    output += `  )\n`
    output += `}\n\n`
    if (useSourceImport) output += `useGLTF.preload(modelUrl)`
    else output += `useGLTF.preload(${loadPathStr})`
    return output
}

// --- DB HELPERS ---

const DB_NAME = 'GltfConverterDB'
const STORE_NAME = 'handles'

async function fileExists(handle: FileSystemDirectoryHandle, fileName: string): Promise<boolean> {
    try {
        await handle.getFileHandle(fileName)
        return true
    } catch {
        return false
    }
}

function openDB(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const db = (event.target as IDBOpenDBRequest).result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME)
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.put(handle, 'models_dir')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    const db = await openDB()
    return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get('models_dir')
        request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) || null)
        request.onerror = () => reject(request.error)
    })
}
