/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CURSOR_WS_URL?: string
}

declare module '*.glb?url' {
  const src: string
  export default src
}

declare module '*.md?raw' {
  const content: string
  export default content
}

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: string | FileSystemHandle
}

interface Window {
  showDirectoryPicker?: (
    options?: DirectoryPickerOptions,
  ) => Promise<FileSystemDirectoryHandle>
}
