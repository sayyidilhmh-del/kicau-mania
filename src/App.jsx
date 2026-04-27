import React, { useState, useEffect, useRef, useCallback } from 'react'
import gsap from 'gsap'
// MediaPipe dimuat via script tag agar kompatibel di production (Vercel)
const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
  const s = document.createElement('script')
  s.src = src
  s.onload = resolve
  s.onerror = reject
  document.head.appendChild(s)
})

const CAT_POSITIONS = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
const CAT_SIZE_RATIO = 0.38

function App() {
  const [showPermission, setShowPermission] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingText, setLoadingText] = useState('Memuat model AI...')
  const [isCatActive, setIsCatActive] = useState(false)

  const videoRef = useRef(null)
  const catVideoRef = useRef(null)
  const canvasRef = useRef(null)
  const audioRef = useRef(null)
  const isCoveredRef = useRef(false)
  const animationFrameRef = useRef(null)
  const isCatActiveRef = useRef(false)
  const tempCanvasRef = useRef(null)

  const removeGreenScreen = useCallback((imageData) => {
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (g >= 80 && g <= 255 && g > r + 30 && g > b + 30) {
        data[i + 3] = 0
      }
    }
    return imageData
  }, [])

  const drawCatsRef = useRef(null)
  drawCatsRef.current = () => {
    const canvas = canvasRef.current
    const video = catVideoRef.current
    if (!canvas || !video || video.readyState < 2 || video.videoWidth === 0) return

    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    if (W === 0 || H === 0) return
    ctx.clearRect(0, 0, W, H)

    if (!tempCanvasRef.current) tempCanvasRef.current = document.createElement('canvas')
    const tmp = tempCanvasRef.current
    tmp.width = video.videoWidth
    tmp.height = video.videoHeight
    const tmpCtx = tmp.getContext('2d')
    tmpCtx.drawImage(video, 0, 0, tmp.width, tmp.height)
    let imgData = tmpCtx.getImageData(0, 0, tmp.width, tmp.height)
    imgData = removeGreenScreen(imgData)
    tmpCtx.putImageData(imgData, 0, 0)

    const vAspect = video.videoHeight / video.videoWidth
    const size = Math.min(W, H) * CAT_SIZE_RATIO
    const w = size
    const h = size * vAspect
    const pad = 12

    const roundedPath = (cx, cy, cw, ch, cr) => {
      ctx.beginPath()
      ctx.moveTo(cx + cr, cy)
      ctx.lineTo(cx + cw - cr, cy)
      ctx.quadraticCurveTo(cx + cw, cy, cx + cw, cy + cr)
      ctx.lineTo(cx + cw, cy + ch - cr)
      ctx.quadraticCurveTo(cx + cw, cy + ch, cx + cw - cr, cy + ch)
      ctx.lineTo(cx + cr, cy + ch)
      ctx.quadraticCurveTo(cx, cy + ch, cx, cy + ch - cr)
      ctx.lineTo(cx, cy + cr)
      ctx.quadraticCurveTo(cx, cy, cx + cr, cy)
      ctx.closePath()
    }

    CAT_POSITIONS.forEach((pos) => {
      let x, y
      switch (pos) {
        case 'center':       x = W / 2 - w / 2;  y = H / 2 - h / 2;  break
        case 'top-left':     x = pad;             y = pad;             break
        case 'top-right':    x = W - w - pad;     y = pad;             break
        case 'bottom-left':  x = pad;             y = H - h - pad;    break
        case 'bottom-right': x = W - w - pad;     y = H - h - pad;    break
        default: x = 0; y = 0
      }
      const r = 16
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = 20
      ctx.shadowOffsetX = 3
      ctx.shadowOffsetY = 5
      roundedPath(x, y, w, h, r)
      ctx.fillStyle = 'rgba(0,0,0,0.001)'
      ctx.fill()
      ctx.restore()

      ctx.save()
      roundedPath(x, y, w, h, r)
      ctx.clip()
      ctx.drawImage(tmp, x, y, w, h)
      ctx.restore()
    })
  }

  const startCatAnimation = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    const video = catVideoRef.current
    if (video) {
      video.currentTime = 0
      video.loop = true
      video.play().catch(e => console.log('Video play error:', e))
    }
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = 0
      audio.loop = true
      audio.play().catch(e => console.log('Audio play error:', e))
    }
    const loop = () => {
      if (!isCatActiveRef.current) return
      drawCatsRef.current?.()
      animationFrameRef.current = requestAnimationFrame(loop)
    }
    loop()
  }, [])

  const stopCatAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    const video = catVideoRef.current
    if (video) { video.pause(); video.currentTime = 0 }
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.currentTime = 0 }
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const playShake = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const start = Date.now()
    const shake = () => {
      const elapsed = Date.now() - start
      if (elapsed > 300) { canvas.style.transform = 'scaleX(-1)'; return }
      const intensity = (1 - elapsed / 300) * 14
      const tx = (Math.random() - 0.5) * intensity
      const ty = (Math.random() - 0.5) * intensity
      canvas.style.transform = `scaleX(-1) translate(${tx}px, ${ty}px)`
      requestAnimationFrame(shake)
    }
    shake()
  }, [])

  const checkCovered = useCallback((face, hands) => {
    if (!face || !hands) return false
    const nose = face[1] || face[4]
    if (!nose) return false
    for (const hand of hands) {
      for (const idx of [4, 8, 12, 16, 20]) {
        if (hand[idx]) {
          const dx = nose.x - hand[idx].x
          const dy = nose.y - hand[idx].y
          if (Math.sqrt(dx * dx + dy * dy) < 0.10) return true
        }
      }
    }
    return false
  }, [])

  useEffect(() => {
    if (showPermission) return
    let cleanupFn = () => {}

    const setup = async () => {
      try {
        const resize = () => {
          if (canvasRef.current) {
            canvasRef.current.width = window.innerWidth
            canvasRef.current.height = window.innerHeight
          }
        }
        resize()
        window.addEventListener('resize', resize)

        setLoadingText('Mengakses Kamera...')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        })

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream

        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            video.play().then(resolve).catch(resolve)
          }
        })

        setLoadingText('Memuat Face Detection...')
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js')
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js')
        const faceMesh = new window.FaceMesh({
          locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
        })
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        })
        let latestFace = null
        faceMesh.onResults((r) => {
          if (r.multiFaceLandmarks?.length > 0) latestFace = r.multiFaceLandmarks[0]
        })

        setLoadingText('Memuat Hand Tracking...')
        const hands = new window.Hands({
          locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
        })
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        })
        let latestHands = null
        hands.onResults((r) => {
          latestHands = r.multiHandLandmarks?.length > 0 ? r.multiHandLandmarks : null
        })

        const sendLoop = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            requestAnimationFrame(sendLoop)
            return
          }
          try {
            await faceMesh.send({ image: videoRef.current })
            await hands.send({ image: videoRef.current })
          } catch (e) {}
          requestAnimationFrame(sendLoop)
        }

        setLoadingText('Model Siap!')
        setIsLoading(false)
        sendLoop()

        const detectInterval = setInterval(() => {
          const covered = checkCovered(latestFace, latestHands)
          if (covered && !isCoveredRef.current) {
            isCoveredRef.current = true
            isCatActiveRef.current = true
            setIsCatActive(true)
            startCatAnimation()
            playShake()
            if (canvasRef.current) gsap.fromTo(canvasRef.current,
              { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }
            )
          } else if (!covered && isCoveredRef.current) {
            isCoveredRef.current = false
            isCatActiveRef.current = false
            setIsCatActive(false)
            stopCatAnimation()
            if (canvasRef.current) gsap.to(canvasRef.current, { opacity: 0, duration: 0.25 })
          }
        }, 80)

        cleanupFn = () => {
          clearInterval(detectInterval)
          window.removeEventListener('resize', resize)
          stream.getTracks().forEach(t => t.stop())
          try { faceMesh.close() } catch (e) {}
          try { hands.close() } catch (e) {}
        }

      } catch (err) {
        console.error(err)
        setLoadingText('Error: ' + err.message)
        setIsLoading(false)
      }
    }

    setup()
    return () => cleanupFn()
  }, [showPermission, checkCovered, startCatAnimation, stopCatAnimation, playShake])

  return (
    <div className="app-root">
      {showPermission && (
        <div className="permission-overlay">
          <div className="permission-card" style={{
            backgroundColor: '#0c0c0c',
            borderRadius: '24px',
            padding: '36px 28px',
            maxWidth: '360px',
            textAlign: 'center',
            border: '1px solid #cca300',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 0 2px rgba(204,163,0,0.2)',
            fontFamily: 'monospace'
          }}>
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                background: 'repeating-linear-gradient(45deg, #000, #000 18px, #cca300 18px, #cca300 36px)',
                width: '80px',
                height: '80px',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                border: '1px solid #cca300'
              }}>
                <span style={{ fontSize: '28px' }}>⚠️</span>
                <span style={{
                  background: '#cca300',
                  color: '#000',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  marginTop: '4px',
                  borderRadius: '20px'
                }}>DANGER</span>
              </div>
            </div>

            <h1 style={{
              color: '#cca300',
              fontSize: '28px',
              fontWeight: '700',
              letterSpacing: '3px',
              marginBottom: '12px',
              textTransform: 'uppercase',
              textShadow: '0 0 6px rgba(204,163,0,0.4)'
            }}>KICAU MANIA</h1>

            <p style={{
              color: '#aaa',
              fontSize: '13px',
              lineHeight: '1.5',
              marginBottom: '32px'
            }}>
              Tutup hidung Mpruyyy <br/> made by Sayy
            </p>

            <button
              onClick={() => setShowPermission(false)}
              style={{
                background: 'transparent',
                border: '1.5px solid #cca300',
                color: '#cca300',
                padding: '12px 20px',
                borderRadius: '40px',
                fontSize: '14px',
                fontWeight: '600',
                letterSpacing: '1px',
                width: '100%',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: '#111',
                fontFamily: 'monospace'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#cca300'
                e.currentTarget.style.color = '#0c0c0c'
                e.currentTarget.style.boxShadow = '0 0 12px rgba(204,163,0,0.6)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#cca300'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
               IZINKAN AKSES KAMERA 
            </button>
          </div>
        </div>
      )}

      {isLoading && !showPermission && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">{loadingText}</div>
        </div>
      )}

      {!showPermission && (
        <div className="video-container" style={{ display: isLoading ? 'none' : 'block' }}>
          <video ref={videoRef} autoPlay playsInline muted className="webcam-video" />
          <canvas ref={canvasRef} className="cat-canvas" />
          <video ref={catVideoRef} src="/kucing-default.mp4" playsInline muted className="hidden-video" preload="auto" />
          <audio ref={audioRef} src="/kicau.mp3" preload="auto" loop />
        </div>
      )}

      {!showPermission && !isLoading && !isCatActive && (
        <div className="instruction-badge" style={{
          position: 'fixed',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #cca300',
          color: '#cca300',
          padding: '10px 24px',
          borderRadius: '40px',
          fontSize: '13px',
          fontFamily: 'monospace',
          fontWeight: '500',
          letterSpacing: '1px',
          whiteSpace: 'nowrap',
          boxShadow: '0 0 10px rgba(0,0,0,0.5)'
        }}>
           TUTUP HIDUNG MPRUYY 
        </div>
      )}
    </div>
  )
}

export default App
