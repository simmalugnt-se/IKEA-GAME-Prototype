import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react'
import { marked } from 'marked'
import mermaid from 'mermaid'
import './DocsPage.css'

// Vite raw-import av DOCS.md
import docsRaw from '../../../DOCS.md?raw'

type Heading = {
  level: number
  text: string
  slug: string
}

const TS_KEYWORDS = /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|import|from|export|default|type|interface|extends|implements|new|class|try|catch|finally|throw|true|false|null|undefined|as|typeof|in|of|await|async)\b/g
const NUMBER_LITERAL = /\b\d+(?:\.\d+)?\b/g
const STRING_LITERAL = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g
const LINE_COMMENT = /(\/\/[^\n]*)/g
const SHELL_COMMENT = /(^|\s)(#[^\n]*)/g
const JSON_PROPERTY = /"(?:[^"\\]|\\.)*"(?=\s*:)/g
const SHELL_FLAG = /(^|\s)(-{1,2}[a-zA-Z][a-zA-Z0-9-]*)/g
const SHELL_VAR = /(\$[a-zA-Z_][a-zA-Z0-9_]*)/g

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

function highlightCode(text: string, lang?: string): string {
  const language = (lang ?? '').toLowerCase()
  let highlighted = escapeHtml(text)

  if (language === 'bash' || language === 'sh' || language === 'zsh') {
    highlighted = highlighted.replace(SHELL_COMMENT, '$1<span class="tok-comment">$2</span>')
    highlighted = highlighted.replace(SHELL_FLAG, '$1<span class="tok-flag">$2</span>')
    highlighted = highlighted.replace(SHELL_VAR, '<span class="tok-variable">$1</span>')
    highlighted = highlighted.replace(NUMBER_LITERAL, '<span class="tok-number">$&</span>')
    return highlighted
  }

  if (language === 'json') {
    highlighted = highlighted.replace(JSON_PROPERTY, '<span class="tok-property">$&</span>')
    highlighted = highlighted.replace(STRING_LITERAL, '<span class="tok-string">$1</span>')
    highlighted = highlighted.replace(NUMBER_LITERAL, '<span class="tok-number">$&</span>')
    highlighted = highlighted.replace(/\b(?:true|false|null)\b/g, '<span class="tok-keyword">$&</span>')
    return highlighted
  }

  highlighted = highlighted.replace(STRING_LITERAL, '<span class="tok-string">$1</span>')
  highlighted = highlighted.replace(LINE_COMMENT, '<span class="tok-comment">$1</span>')
  highlighted = highlighted.replace(TS_KEYWORDS, '<span class="tok-keyword">$&</span>')
  highlighted = highlighted.replace(NUMBER_LITERAL, '<span class="tok-number">$&</span>')
  return highlighted
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
    const highlighted = highlightCode(text, lang)
    return `<pre class="docs-code"><code class="language-${lang || 'plain'}">${highlighted}</code></pre>`
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

  // Scroll spy: håll aktiv sidebar-länk synkad med scroll-position.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return

    const headingEls = Array.from(
      root.querySelectorAll<HTMLElement>('h1, h2, h3'),
    ).filter((el) => Boolean(el.id))

    if (headingEls.length === 0) return

    const updateActiveFromScroll = () => {
      const anchorOffset = 120
      let current = headingEls[0].id

      for (const el of headingEls) {
        const top = el.getBoundingClientRect().top
        if (top <= anchorOffset) {
          current = el.id
        } else {
          break
        }
      }

      setActiveSlug((prev) => (prev === current ? prev : current))
    }

    let ticking = false
    const onScrollOrResize = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        ticking = false
        updateActiveFromScroll()
      })
    }

    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    updateActiveFromScroll()

    return () => {
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [htmlContent])

  const handleNavClick = useCallback((e: MouseEvent<HTMLAnchorElement>, slug: string) => {
    e.preventDefault()
    const root = contentRef.current
    if (!root) return
    const escapedSlug = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(slug) : slug
    const el = root.querySelector<HTMLElement>(`#${escapedSlug}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSlug(slug)
      window.history.replaceState(null, '', `#${slug}`)
    }
  }, [])

  // Scroll till hash vid laddning
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return

    const timer = setTimeout(() => {
      const root = contentRef.current
      if (!root) return
      const escapedHash = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(hash) : hash
      const el = root.querySelector<HTMLElement>(`#${escapedHash}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActiveSlug(hash)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [htmlContent])

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
