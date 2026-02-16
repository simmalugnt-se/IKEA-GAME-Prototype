import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react'
import { marked } from 'marked'
import mermaid from 'mermaid'
import './DocsPage.css'

// Vite raw-import av DOCS.md
import docsRaw from '../DOCS.md?raw'

type Heading = {
  level: number
  text: string
  slug: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  const lines = markdown.split('\n')
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(#{1,3})\s+(.+)/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/[`*_]/g, ''),
        slug: slugify(match[2].replace(/[`*_]/g, '')),
      })
    }
  }
  return headings
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Custom renderer som lägger till id på headings
function configureMarked(): void {
  const renderer = new marked.Renderer()

  renderer.heading = function ({ text, depth }: { text: string; depth: number }) {
    const cleanText = text.replace(/<[^>]*>/g, '')
    const slug = slugify(cleanText)
    return `<h${depth} id="${slug}">${text}</h${depth}>`
  }

  // Mermaid-block renderas som figurer med speciell klass
  renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
    if (lang === 'mermaid') {
      return `<pre class="mermaid">${text}</pre>`
    }
    return `<pre class="docs-code"><code class="language-${lang || ''}">${escapeHtml(text)}</code></pre>`
  }

  marked.setOptions({
    renderer,
    gfm: true,
    breaks: false,
  })
}

export function DocsPage() {
  const [activeSlug, setActiveSlug] = useState('')
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Parse markdown
  const headings = useMemo(() => extractHeadings(docsRaw), [])

  useMemo(() => configureMarked(), [])
  const htmlContent = useMemo(() => marked.parse(docsRaw) as string, [])

  // Scroll spy: track vilken heading som är synlig
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSlug(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0.1 },
    )

    const headingEls = document.querySelectorAll<HTMLElement>(
      '.docs-content h1, .docs-content h2, .docs-content h3',
    )
    headingEls.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [htmlContent])

  const handleNavClick = useCallback((e: MouseEvent<HTMLAnchorElement>, slug: string) => {
    e.preventDefault()
    const el = document.getElementById(slug)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSlug(slug)
      window.history.replaceState(null, '', `#${slug}`)
    }
  }, [])

  // Scroll till hash vid laddning
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [])

  // Mermaid: initialisera och rendera diagram efter mount
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#161b22',
        primaryColor: '#1f6feb',
        primaryTextColor: '#e6edf3',
        primaryBorderColor: '#30363d',
        lineColor: '#8b949e',
        secondaryColor: '#21262d',
        tertiaryColor: '#161b22',
      },
    })

    // Vänta tills React har commitat HTML till DOM
    const timer = setTimeout(() => {
      if (contentRef.current) {
        const nodes = contentRef.current.querySelectorAll<HTMLElement>('pre.mermaid')
        if (nodes.length > 0) {
          mermaid.run({ nodes })
        }
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [htmlContent])

  return (
    <div className="docs-layout">
      {/* Sidebar */}
      <nav className="docs-sidebar">
        <div className="docs-sidebar-header">
          <span className="docs-logo">📘</span>
          <span>Dokumentation</span>
        </div>
        <ul className="docs-nav">
          {headings.map((h, i) => (
            <li key={i} className={`docs-nav-item level-${h.level}`}>
              <a
                href={`#${h.slug}`}
                className={activeSlug === h.slug ? 'active' : ''}
                onClick={(e) => handleNavClick(e, h.slug)}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <main className="docs-main">
        <div
          ref={contentRef}
          className="docs-content"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </main>
    </div>
  )
}
