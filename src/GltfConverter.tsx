import * as THREE from 'three'
import { useState, useEffect, type DragEvent } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

type ParsedSpline = {
  name: string
  parentPath: string[]
  siblingIndex: number
  anchorIndex: number
  points: number[][]
  closed: boolean
  tension: number
  castShadow: boolean
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
                        const originalNameRaw = typeof child.userData?.originalName === 'string'
                            ? child.userData.originalName as string
                            : (child.name || 'Spline')
                        const originalName = normalizeNodeName(originalNameRaw) || 'Spline'
                        const parentPath = getParentPathNames(child, fbxScene)
                        const parentChildren = child.parent?.children ?? []
                        const siblingIndex = Math.max(parentChildren.indexOf(child), 0)
                        const anchorIndex = parentChildren
                            .slice(0, siblingIndex)
                            .filter((sibling: any) => isVisualHierarchyNode(sibling))
                            .length
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
                        const castShadow = !hasSplineNoShadowToken(originalName)

                        splines.push({
                            name: originalName,
                            parentPath,
                            siblingIndex,
                            anchorIndex,
                            points,
                            closed,
                            tension: isLinear ? 0 : 0.5,
                            castShadow,
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

function normalizeNodeName(name: string): string {
    return name.split('\u0000')[0].trim()
}

function isColliderName(name: string): boolean {
    return name.toLowerCase().includes('_collider')
}

function isVisualHierarchyNode(node: any): boolean {
    if (!node || node.isLine) return false
    const name = typeof node.name === 'string' ? node.name : ''
    return !isColliderName(name) || hasPhysicsToken(name)
}

function toCanonicalNodeName(name: string): string {
    const normalized = normalizeNodeName(name)
    const withoutNamespace = normalized.includes('::')
        ? (normalized.split('::').pop() ?? normalized)
        : normalized
    return sanitizeName(withoutNamespace).toLowerCase()
}

function buildPathKey(path: string[]): string {
    return path.join('>')
}

function getParentPathNames(obj: THREE.Object3D, root: THREE.Object3D): string[] {
    const names: string[] = []
    let current: THREE.Object3D | null = obj.parent

    while (current && current !== root) {
        const rawName = typeof current.userData?.originalName === 'string'
            ? current.userData.originalName as string
            : (current.name || '')
        const cleaned = normalizeNodeName(rawName)
        if (cleaned) names.push(cleaned)
        current = current.parent
    }

    return names.reverse()
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

function getPhysicsTypeFromName(name: string): 'dynamic' | 'fixed' | 'kinematicPosition' | 'noneToDynamicOnCollision' | 'solidNoneToDynamicOnCollision' | 'animNoneToDynamicOnCollision' | null {
    const lower = name.toLowerCase()
    if (lower.includes('_solidnonetodynamic') || lower.includes('_solid_none_to_dynamic')) return 'solidNoneToDynamicOnCollision'
    if (lower.includes('_animnonetodynamic') || lower.includes('_anim_none_to_dynamic')) return 'animNoneToDynamicOnCollision'
    if (lower.includes('_nonetodynamic') || lower.includes('_none_to_dynamic')) return 'noneToDynamicOnCollision'
    if (lower.includes('_dynamic')) return 'dynamic'
    if (lower.includes('_static') || lower.includes('_fixed')) return 'fixed'
    if (lower.includes('_kinematic')) return 'kinematicPosition'
    return null
}

function hasPhysicsToken(name: string): boolean {
    return getPhysicsTypeFromName(name) !== null
}

function hasSplineNoShadowToken(name: string): boolean {
    const lower = name.toLowerCase()
    return lower.includes('_noshadow') || lower.includes('_shadowoff')
}

type ParsedPhysicsConfig = {
    type: 'dynamic' | 'fixed' | 'kinematicPosition' | 'noneToDynamicOnCollision' | 'solidNoneToDynamicOnCollision' | 'animNoneToDynamicOnCollision'
    mass?: number
    friction?: number
    lockRotations?: boolean
    sensor?: boolean
}

const SLOT_WORDS = [
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
]

function toSlotName(prefix: string, index: number): string {
    const suffix = SLOT_WORDS[index] ?? `${index + 1}`
    return `${prefix}${suffix}`
}

function parsePhysicsConfigFromName(name: string): ParsedPhysicsConfig | null {
    const type = getPhysicsTypeFromName(name)
    if (!type) return null

    const config: ParsedPhysicsConfig = { type }
    const lower = name.toLowerCase()

    const massMatch = name.match(/_mass([\d.]+)/i)
    if (massMatch) {
        const massValue = parseFloat(massMatch[1])
        if (Number.isFinite(massValue)) config.mass = massValue
    }

    const fricMatch = name.match(/_fric([\d.]+)/i)
    if (fricMatch) {
        const frictionValue = parseFloat(fricMatch[1])
        if (Number.isFinite(frictionValue)) config.friction = frictionValue
    }

    if (lower.includes('_lockrot')) config.lockRotations = true
    const hasAnimNoneToDynamicToken = lower.includes('_animnonetodynamic') || lower.includes('_anim_none_to_dynamic')
    const hasSolidNoneToDynamicToken = lower.includes('_solidnonetodynamic') || lower.includes('_solid_none_to_dynamic')
    const hasNoneToDynamicToken = lower.includes('_nonetodynamic') || lower.includes('_none_to_dynamic')
    if (lower.includes('_sensor') && !hasAnimNoneToDynamicToken && !hasSolidNoneToDynamicToken && !hasNoneToDynamicToken) config.sensor = true

    return config
}

function getHiddenFromName(name: string): boolean | null {
    const lower = name.toLowerCase()
    if (lower.includes('_hidden') || lower.includes('_invisible')) return true

    return null
}

function getPhysicsConfigSignature(config: ParsedPhysicsConfig): string {
    return [
        `type:${config.type}`,
        `mass:${config.mass ?? ''}`,
        `friction:${config.friction ?? ''}`,
        `lockRotations:${config.lockRotations ? '1' : '0'}`,
        `sensor:${config.sensor ? '1' : '0'}`,
    ].join('|')
}

function formatPhysicsConfigLiteral(config: ParsedPhysicsConfig): string {
    const parts: string[] = [`type: '${config.type}'`]
    if (config.mass !== undefined) parts.push(`mass: ${config.mass}`)
    if (config.friction !== undefined) parts.push(`friction: ${config.friction}`)
    if (config.lockRotations) parts.push('lockRotations: true')
    if (config.sensor) parts.push('sensor: true')
    return `{ ${parts.join(', ')} }`
}

function generateJsxFromScene(scene: THREE.Object3D, originalFileName: string, settings: GenerateSettings): string {
    const { useSourceImport, modelPath, componentPath, animations = [], splines = [] } = settings
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
    const animationNames = Array.from(new Set(selectableAnims.map((a) => a.name)))
    const hasAnimations = selectableAnims.length > 0
    const animationTypeName = `${componentName}Animation`
    const animationTypeLiteral = animationNames.length > 0
        ? animationNames.map((name) => JSON.stringify(name)).join(' | ')
        : 'never'
    const hasSplines = splines.length > 0

    function getColorFromName(name: string): number | null {
        const match = name.match(/_color(\d+)/i)
        if (!match) return null
        const parsed = parseInt(match[1], 10)
        if (!Number.isFinite(parsed)) return null
        return Math.max(0, Math.trunc(parsed))
    }

    function hasSingleTone(name: string): boolean {
        return name.toLowerCase().includes('_singletone')
    }

    type IndexedSpline = {
        id: number
        spline: ParsedSpline
        canonicalParentPath: string[]
        siblingIndex: number
        anchorIndex: number
    }

    const indexedSplines: IndexedSpline[] = splines.map((spline, id) => ({
        id,
        spline,
        canonicalParentPath: spline.parentPath.map(toCanonicalNodeName).filter(Boolean),
        siblingIndex: Number.isFinite(spline.siblingIndex) ? spline.siblingIndex : id,
        anchorIndex: Number.isFinite(spline.anchorIndex) ? spline.anchorIndex : 0,
    }))

    type ScenePathCandidate = {
        key: string
        canonicalPath: string[]
    }

    const scenePathCandidates: ScenePathCandidate[] = [{ key: '', canonicalPath: [] }]
    const scenePathSet = new Set<string>([''])

    function collectScenePaths(obj: THREE.Object3D, path: string[] = []): void {
        const cleanedName = normalizeNodeName(obj.name)
        const currentPath = cleanedName ? [...path, cleanedName] : path
        const canonicalPath = currentPath.map(toCanonicalNodeName).filter(Boolean)
        const key = buildPathKey(canonicalPath)

        if (!scenePathSet.has(key)) {
            scenePathSet.add(key)
            scenePathCandidates.push({ key, canonicalPath })
        }

        obj.children.forEach((child) => collectScenePaths(child, currentPath))
    }

    scene.children.forEach((child) => collectScenePaths(child))

    const singleTopLevelPathKey = (() => {
        const levelOneKeys = Array.from(
            new Set(
                scenePathCandidates
                    .filter((candidate) => candidate.canonicalPath.length === 1)
                    .map((candidate) => candidate.key)
            )
        )
        return levelOneKeys.length === 1 ? levelOneKeys[0] : null
    })()

    function matchSplineParentKey(canonicalParentPath: string[]): string | null {
        const exactKey = buildPathKey(canonicalParentPath)
        if (scenePathSet.has(exactKey)) return exactKey

        if (canonicalParentPath.length === 0) return ''

        let bestMatchKey: string | null = null
        let bestOffset = Number.POSITIVE_INFINITY

        scenePathCandidates.forEach((candidate) => {
            if (candidate.canonicalPath.length < canonicalParentPath.length) return
            const offset = candidate.canonicalPath.length - canonicalParentPath.length
            for (let i = 0; i < canonicalParentPath.length; i += 1) {
                if (candidate.canonicalPath[offset + i] !== canonicalParentPath[i]) return
            }
            if (offset < bestOffset) {
                bestOffset = offset
                bestMatchKey = candidate.key
            }
        })

        return bestMatchKey
    }

    const splinesByParentKey = new Map<string, IndexedSpline[]>()
    indexedSplines.forEach((entry) => {
        const matchedParentKey = matchSplineParentKey(entry.canonicalParentPath)
        if (matchedParentKey === null) return

        // FBXLoader kan ibland tappa parent för kurvor (tom path) när hierarkin exporteras.
        // Om scenen har en tydlig enda toppgrupp, placera sådana splines där istället för i root.
        const parentKey = matchedParentKey === ''
            && entry.canonicalParentPath.length === 0
            && singleTopLevelPathKey
            ? singleTopLevelPathKey
            : matchedParentKey

        const list = splinesByParentKey.get(parentKey)
        if (list) list.push(entry)
        else splinesByParentKey.set(parentKey, [entry])
    })

    splinesByParentKey.forEach((list) => {
        list.sort((a, b) => {
            if (a.anchorIndex !== b.anchorIndex) return a.anchorIndex - b.anchorIndex
            if (a.siblingIndex !== b.siblingIndex) return a.siblingIndex - b.siblingIndex
            return a.id - b.id
        })
    })

    const renderedSplineIds = new Set<number>()

    function toRounded(value: number): number {
        return parseFloat(value.toFixed(4))
    }

    function renderSplineEntries(entries: IndexedSpline[], indent: number, hiddenExpression = 'false'): string {
        if (entries.length === 0) return ''

        const spaces = ' '.repeat(indent)
        let splineOutput = ''
        const hasHiddenControl = hiddenExpression !== 'false'

        entries.forEach((entry) => {
            renderedSplineIds.add(entry.id)
            const spline = entry.spline
            const cleanName = normalizeNodeName(spline.name) || 'Spline'
            const tp = spline.transform
            const rotationDeg = {
                x: THREE.MathUtils.radToDeg(tp.rotation.x),
                y: THREE.MathUtils.radToDeg(tp.rotation.y),
                z: THREE.MathUtils.radToDeg(tp.rotation.z),
            }

            let splineProps = ''
            if (Math.abs(tp.position.x) > 0.0001 || Math.abs(tp.position.y) > 0.0001 || Math.abs(tp.position.z) > 0.0001) {
                splineProps += `\n${spaces}  position={[${toRounded(tp.position.x)}, ${toRounded(tp.position.y)}, ${toRounded(tp.position.z)}]}`
            }
            if (Math.abs(rotationDeg.x) > 0.0001 || Math.abs(rotationDeg.y) > 0.0001 || Math.abs(rotationDeg.z) > 0.0001) {
                splineProps += `\n${spaces}  rotation={[${toRounded(rotationDeg.x)}, ${toRounded(rotationDeg.y)}, ${toRounded(rotationDeg.z)}]}`
            }

            splineOutput += `${spaces}{/* ${cleanName} */}\n`
            splineOutput += `${spaces}<SplineElement\n`
            splineOutput += `${spaces}  points={${JSON.stringify(spline.points)}}\n`
            splineOutput += `${spaces}  closed={${spline.closed}}\n`
            splineOutput += `${spaces}  tension={${spline.tension}}\n`
            if (spline.castShadow === false) {
                splineOutput += `${spaces}  castShadow={false}\n`
            }
            if (hasHiddenControl) {
                splineOutput += `${spaces}  visible={!${hiddenExpression}}\n`
            }
            splineOutput += `${spaces}  curveType="catmullrom"${splineProps}\n`
            splineOutput += `${spaces}/>\n`
        })

        return splineOutput
    }

    const colorIndicesInUse: number[] = []
    const colorIndexSet = new Set<number>()
    const hiddenValuesInUse: boolean[] = []
    const hiddenValueSet = new Set<boolean>()

    type RigidBodySlotConfig = {
        slot: string
        signature: string
        profile: ParsedPhysicsConfig
    }

    const rigidBodySlots: RigidBodySlotConfig[] = []
    const rigidBodySlotBySignature = new Map<string, string>()

    function registerColorIndex(colorIndex: number): void {
        if (!Number.isFinite(colorIndex)) return
        const normalized = Math.max(0, Math.trunc(colorIndex))
        if (colorIndexSet.has(normalized)) return
        colorIndexSet.add(normalized)
        colorIndicesInUse.push(normalized)
    }

    function registerHiddenValue(hidden: boolean): void {
        const normalized = Boolean(hidden)
        if (hiddenValueSet.has(normalized)) return
        hiddenValueSet.add(normalized)
        hiddenValuesInUse.push(normalized)
    }

    function registerRigidBodyProfile(profile: ParsedPhysicsConfig): string {
        const signature = getPhysicsConfigSignature(profile)
        const existing = rigidBodySlotBySignature.get(signature)
        if (existing) return existing

        const slot = toSlotName('rigidBody', rigidBodySlots.length)
        rigidBodySlots.push({ slot, signature, profile })
        rigidBodySlotBySignature.set(signature, slot)
        return slot
    }

    function collectMetadata(
        obj: any,
        inheritedColor: number | null = null,
        inheritedHidden: boolean | null = null,
    ): void {
        if (obj.userData?.ignore) return

        const rawName = obj.name
        const ownColor = getColorFromName(rawName)
        const currentColor = ownColor ?? inheritedColor ?? 0
        const ownHidden = getHiddenFromName(rawName)
        const currentHidden = ownHidden ?? inheritedHidden ?? false
        const hasHiddenContext = ownHidden !== null || inheritedHidden !== null
        const physicsConfig = parsePhysicsConfigFromName(rawName)

        if (physicsConfig) {
            registerRigidBodyProfile(physicsConfig)
        }

        const selfIsCollider = isColliderName(rawName)
        const colliderChildren = obj.children.filter((c: any) => isColliderName(c.name) && !hasPhysicsToken(c.name))
        const explicitColliderMeshes = colliderChildren.filter((c: any) => Boolean(c.geometry))
        const visualChildren = obj.children.filter((c: any) => !isColliderName(c.name) || hasPhysicsToken(c.name))

        if (physicsConfig) {
            const useSelfMeshCollider = selfIsCollider
                && obj.isMesh
                && Boolean(obj.geometry)
                && explicitColliderMeshes.length === 0

            const shouldRenderOwnColliderMesh = useSelfMeshCollider
            if (obj.isMesh && (!selfIsCollider || shouldRenderOwnColliderMesh)) {
                registerColorIndex(currentColor)
                if (hasHiddenContext) registerHiddenValue(currentHidden)
            }

            visualChildren.forEach((child: any) => collectMetadata(child, currentColor, currentHidden))
            return
        }

        if (obj.isMesh && !selfIsCollider) {
            registerColorIndex(currentColor)
            if (hasHiddenContext) registerHiddenValue(currentHidden)
            visualChildren.forEach((child: any) => collectMetadata(child, currentColor, currentHidden))
            return
        }

        if (!selfIsCollider) {
            visualChildren.forEach((child: any) => collectMetadata(child, currentColor, currentHidden))
        }
    }

    scene.children.forEach((child) => collectMetadata(child))
    if (colorIndicesInUse.length === 0) registerColorIndex(0)

    const colorSlots = colorIndicesInUse.map((colorIndex, slotIndex) => ({
        slot: `materialColor${slotIndex}`,
        colorIndex,
    }))
    const colorSlotByIndex = new Map<number, string>(colorSlots.map((entry) => [entry.colorIndex, entry.slot]))
    const hiddenSlots = hiddenValuesInUse.map((hiddenValue, slotIndex) => ({
        slot: `materialHidden${slotIndex}`,
        hiddenValue,
    }))
    const hiddenSlotByValue = new Map<boolean, string>(hiddenSlots.map((entry) => [entry.hiddenValue, entry.slot]))
    const firstColorSlot = colorSlots[0]?.slot
    const firstHiddenSlot = hiddenSlots[0]?.slot
    const firstRigidBodySlot = rigidBodySlots[0]?.slot

    let usesConvexHullCollider = false
    let usesCuboidCollider = false

    // --- Steg 2: Bygg output ---
    let output = `/*\nAuto-generated by C4D to R3F Converter\nModel: ${originalFileName}\n*/\n\n`
    output += `import * as THREE from 'three'\n`
    output += `import { useRef, useEffect } from 'react'\n`
    output += `import { useGLTF${hasAnimations ? ', useAnimations' : ''} } from '@react-three/drei'\n`
    output += `__RAPIER_IMPORT__\n`
    output += `import type { ThreeElements } from '@react-three/fiber'\n`
    const componentImports = ['C4DMesh', 'C4DMaterial']
    if (hasSplines) componentImports.push('SplineElement')
    if (rigidBodySlots.length > 0) componentImports.push('GameRigidBody')
    output += `import { ${componentImports.join(', ')} } from '${componentPath}'\n`
    if (rigidBodySlots.length > 0) {
        output += `import type { GamePhysicsBodyType } from '${componentPath}'\n`
    }
    output += `import type { MaterialColorIndex } from '../../GameSettings'\n`
    if (importStr) output += `${importStr}\n`
    output += `\n`

    if (colorSlots.length > 0) {
        output += `type MaterialColorSlot = ${colorSlots.map(({ slot }) => `'${slot}'`).join(' | ')}\n`
    }
    if (hiddenSlots.length > 0) {
        output += `type MaterialHiddenSlot = ${hiddenSlots.map(({ slot }) => `'${slot}'`).join(' | ')}\n`
    }

    if (rigidBodySlots.length > 0) {
        output += `type GeneratedRigidBodySettings = {\n`
        output += `  type: GamePhysicsBodyType\n`
        output += `  mass?: number\n`
        output += `  friction?: number\n`
        output += `  lockRotations?: boolean\n`
        output += `  sensor?: boolean\n`
        output += `}\n`
        output += `type RigidBodySlot = ${rigidBodySlots.map(({ slot }) => `'${slot}'`).join(' | ')}\n`
    }

    if (colorSlots.length > 0 || hiddenSlots.length > 0 || rigidBodySlots.length > 0) output += `\n`

    if (hasAnimations) {
        output += `export type ${animationTypeName} = ${animationTypeLiteral}\n\n`
    }

    output += `type ${componentName}Props = ThreeElements['group'] & {\n`
    if (hasAnimations) {
        output += `  animation?: ${animationTypeName} | null\n`
        output += `  fadeDuration?: number\n`
    }
    colorSlots.forEach(({ slot }) => {
        output += `  ${slot}?: MaterialColorIndex\n`
    })
    hiddenSlots.forEach(({ slot }) => {
        output += `  ${slot}?: boolean\n`
    })
    rigidBodySlots.forEach(({ slot }) => {
        output += `  ${slot}?: Partial<GeneratedRigidBodySettings>\n`
    })
    output += `}\n\n`

    const componentParams: string[] = []
    if (hasAnimations) {
        componentParams.push('animation = null')
        componentParams.push('fadeDuration = 0.3')
    }
    colorSlots.forEach(({ slot, colorIndex }) => {
        componentParams.push(`${slot} = ${colorIndex}`)
    })
    hiddenSlots.forEach(({ slot, hiddenValue }) => {
        componentParams.push(`${slot} = ${hiddenValue}`)
    })
    rigidBodySlots.forEach(({ slot }) => {
        componentParams.push(slot)
    })
    componentParams.push('...props')

    output += `export function ${componentName}({ ${componentParams.join(', ')} }: ${componentName}Props) {\n`

    // Refs och hooks
    if (hasAnimations) {
        output += `  const group = useRef<THREE.Group | null>(null)\n`
        output += `  const { nodes, animations } = useGLTF(${loadPathStr}) as unknown as { nodes: Record<string, THREE.Mesh>; animations: THREE.AnimationClip[] }\n`
        output += `  const { actions } = useAnimations(animations, group)\n\n`

        // Crossfade-logik
        output += `  // Crossfade mellan animationer\n`
        output += `  // animation={null} = rest position, animation="${animationNames[0] || 'Anim1'}" = spela\n`
        output += `  useEffect(() => {\n`
        output += `    Object.values(actions).forEach((a) => a?.fadeOut(fadeDuration))\n`
        output += `    if (animation && actions[animation]) {\n`
        output += `      actions[animation].reset().fadeIn(fadeDuration).play()\n`
        output += `    }\n`
        output += `  }, [animation, fadeDuration, actions])\n\n`

        // Kommentar med tillgängliga animationer
        output += `  // Tillgängliga animationer: ${animationNames.map((name) => `"${name}"`).join(', ')}\n\n`
    } else {
        output += `  const { nodes } = useGLTF(${loadPathStr}) as unknown as { nodes: Record<string, THREE.Mesh> }\n`
    }

    if (colorSlots.length > 0) {
        output += `\n  const materialColors: Record<MaterialColorSlot, MaterialColorIndex> = {\n`
        colorSlots.forEach(({ slot }) => {
            output += `    ${slot},\n`
        })
        output += `  }\n`
    }

    if (hiddenSlots.length > 0) {
        output += `\n  const materialHiddens: Record<MaterialHiddenSlot, boolean> = {\n`
        hiddenSlots.forEach(({ slot }) => {
            output += `    ${slot},\n`
        })
        output += `  }\n`
    }

    if (rigidBodySlots.length > 0) {
        output += `\n  const rigidBodies: Record<RigidBodySlot, GeneratedRigidBodySettings> = {\n`
        rigidBodySlots.forEach(({ slot, profile }) => {
            output += `    ${slot}: { ...${formatPhysicsConfigLiteral(profile)}, ...(${slot} ?? {}) },\n`
        })
        output += `  }\n\n`
        output += `  const getRigidBodyProps = (slot: RigidBodySlot): GeneratedRigidBodySettings => {\n`
        output += `    const body = rigidBodies[slot]\n`
        output += `    return {\n`
        output += `      type: body.type,\n`
        output += `      ...(body.mass !== undefined ? { mass: body.mass } : {}),\n`
        output += `      ...(body.friction !== undefined ? { friction: body.friction } : {}),\n`
        output += `      ...(body.lockRotations ? { lockRotations: true } : {}),\n`
        output += `      ...(body.sensor ? { sensor: true } : {}),\n`
        output += `    }\n`
        output += `  }\n`
    }

    output += `\n`

    output += `  return (\n`
    if (hasAnimations) {
        output += `    <group ref={group} {...props} dispose={null}>\n`
    } else {
        output += `    <group {...props} dispose={null}>\n`
    }

    function renderChildrenWithSplines(
        parentPath: string[],
        visualChildren: any[],
        childIndent: number,
        inheritedColor: number | null,
        inheritedHidden: boolean | null,
    ): string {
        const canonicalPath = parentPath.map(toCanonicalNodeName).filter(Boolean)
        const parentKey = buildPathKey(canonicalPath)
        const pendingSplines = (splinesByParentKey.get(parentKey) ?? [])
            .filter((entry) => !renderedSplineIds.has(entry.id))

        const inheritedHiddenSlot = inheritedHidden !== null
            ? (hiddenSlotByValue.get(Boolean(inheritedHidden)) ?? firstHiddenSlot)
            : null
        const inheritedHiddenExpression = inheritedHidden !== null
            ? (inheritedHiddenSlot ? `materialHiddens.${inheritedHiddenSlot}` : `${Boolean(inheritedHidden)}`)
            : 'false'

        if (pendingSplines.length === 0) {
            let childrenOnly = ''
            visualChildren.forEach((child) => {
                childrenOnly += traverse(child, childIndent, inheritedColor, parentPath, inheritedHidden)
            })
            return childrenOnly
        }

        const splinesByAnchor = new Map<number, IndexedSpline[]>()
        pendingSplines.forEach((entry) => {
            const clampedAnchor = Math.min(Math.max(entry.anchorIndex, 0), visualChildren.length)
            const bucket = splinesByAnchor.get(clampedAnchor)
            if (bucket) bucket.push(entry)
            else splinesByAnchor.set(clampedAnchor, [entry])
        })

        let combined = ''
        for (let i = 0; i <= visualChildren.length; i += 1) {
            const splineEntries = splinesByAnchor.get(i)
            if (splineEntries && splineEntries.length > 0) {
                combined += renderSplineEntries(splineEntries, childIndent, inheritedHiddenExpression)
            }
            if (i < visualChildren.length) {
                combined += traverse(visualChildren[i], childIndent, inheritedColor, parentPath, inheritedHidden)
            }
        }
        return combined
    }

    function traverse(
        obj: any,
        indent = 6,
        inheritedColor: number | null = null,
        path: string[] = [],
        inheritedHidden: boolean | null = null,
    ): string {
        let str = ''
        const spaces = ' '.repeat(indent)
        if (obj.userData?.ignore) return ''

        const rawName = obj.name
        const cleanedName = normalizeNodeName(rawName)
        const currentPath = cleanedName ? [...path, cleanedName] : path
        const safeName = sanitizeName(rawName)
        const transformProps = getTransformProps(obj)

        const ownColor = getColorFromName(rawName)
        const currentColor = ownColor ?? inheritedColor ?? 0
        const currentColorSlot = colorSlotByIndex.get(currentColor) ?? firstColorSlot
        const colorExpression = currentColorSlot ? `materialColors.${currentColorSlot}` : '0'
        const ownHidden = getHiddenFromName(rawName)
        const currentHidden = ownHidden ?? inheritedHidden ?? false
        const hasHiddenContext = ownHidden !== null || inheritedHidden !== null
        const currentHiddenSlot = hiddenSlotByValue.get(Boolean(currentHidden)) ?? firstHiddenSlot
        const hiddenExpression = hasHiddenContext
            ? (currentHiddenSlot ? `materialHiddens.${currentHiddenSlot}` : `${Boolean(currentHidden)}`)
            : 'false'
        const visibilityProp = hasHiddenContext ? ` visible={!${hiddenExpression}}` : ''
        const singleTone = hasSingleTone(rawName)

        const physicsConfig = parsePhysicsConfigFromName(rawName)
        const physicsSignature = physicsConfig ? getPhysicsConfigSignature(physicsConfig) : null
        const physicsSlot = physicsSignature
            ? (rigidBodySlotBySignature.get(physicsSignature) ?? firstRigidBodySlot)
            : null

        const isSelfCollider = isColliderName(rawName)
        const colliderChildren = obj.children.filter((c: any) => isColliderName(c.name) && !hasPhysicsToken(c.name))
        const explicitColliderMeshes = colliderChildren.filter((c: any) => Boolean(c.geometry))
        const visualChildren = obj.children.filter((c: any) => !isColliderName(c.name) || hasPhysicsToken(c.name))

        const singleToneProp = singleTone ? ' singleTone' : ''

        if (physicsConfig && physicsSlot) {
            const useSelfMeshCollider = isSelfCollider
                && obj.isMesh
                && Boolean(obj.geometry)
                && explicitColliderMeshes.length === 0

            const useFallbackCuboidCollider = isSelfCollider
                && !useSelfMeshCollider
                && explicitColliderMeshes.length === 0

            const fallbackBounds = useFallbackCuboidCollider ? getLocalBoundsForObject(obj) : null
            const hasFallbackCollider = Boolean(fallbackBounds && fallbackBounds.size.lengthSq() > 0.0000001)

            const hasExplicitColliders = explicitColliderMeshes.length > 0
            const disableAutoColliders = hasExplicitColliders || useSelfMeshCollider || hasFallbackCollider
            const collidersAttr = disableAutoColliders ? ' colliders={false}' : ''

            str += `${spaces}<GameRigidBody {...getRigidBodyProps('${physicsSlot}')}${collidersAttr}${transformProps}>\n`

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
                str += `${spaces}  <C4DMesh name={nodes['${safeName}'].name} geometry={nodes['${safeName}'].geometry} castShadow receiveShadow${visibilityProp}>\n`
                str += `${spaces}    <C4DMaterial color={${colorExpression}}${singleToneProp} />\n`
                str += renderChildrenWithSplines(currentPath, visualChildren, indent + 4, currentColor, currentHidden)
                str += `${spaces}  </C4DMesh>\n`
            } else {
                str += renderChildrenWithSplines(currentPath, visualChildren, indent + 2, currentColor, currentHidden)
            }
            str += `${spaces}</GameRigidBody>\n`
        } else if (obj.isMesh && !isSelfCollider) {
            str += `${spaces}<C4DMesh name={nodes['${safeName}'].name} geometry={nodes['${safeName}'].geometry} castShadow receiveShadow${transformProps}${visibilityProp}>\n`
            str += `${spaces}  <C4DMaterial color={${colorExpression}}${singleToneProp} />\n`
            str += renderChildrenWithSplines(currentPath, visualChildren, indent + 2, currentColor, currentHidden)
            str += `${spaces}</C4DMesh>\n`
        } else if (!isSelfCollider) {
            // Bevara grupphierarkin 1:1 från GLB/FBX.
            // Även identitetsgrupper (utan transform) måste finnas kvar för korrekt animation-binding.
            const groupName = normalizeNodeName(rawName) || rawName
            str += `${spaces}<group name={${JSON.stringify(groupName)}}${transformProps}>\n`
            str += renderChildrenWithSplines(currentPath, visualChildren, indent + 2, currentColor, currentHidden)
            str += `${spaces}</group>\n`
        }

        return str
    }

    output += renderChildrenWithSplines([], scene.children, 6, null, null)

    const unmatchedSplines = indexedSplines.filter((entry) => !renderedSplineIds.has(entry.id))
    if (unmatchedSplines.length > 0) {
        output += `      {/* Splines (fallback for unmatched parent path) */}\n`
        output += renderSplineEntries(unmatchedSplines, 6, 'false')
    }

    const rapierImports: string[] = []
    if (rigidBodySlots.length > 0) {
        if (usesConvexHullCollider) rapierImports.push('ConvexHullCollider')
        if (usesCuboidCollider) rapierImports.push('CuboidCollider')
    }
    const rapierImportLine = rapierImports.length > 0
        ? `import { ${rapierImports.join(', ')} } from '@react-three/rapier'`
        : ''
    output = output.replace('__RAPIER_IMPORT__', rapierImportLine)

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
