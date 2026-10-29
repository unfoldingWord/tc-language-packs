// Motion: everything is visible without this script. With it, parts of each section rise in once, staggered,
// and the hero stage opens like a card slid out of its slot. Reduced motion keeps the content and drops the travel.
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || !('IntersectionObserver' in window)) return

  document.documentElement.classList.add('reveal-ready')
  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('in')
        seen.unobserve(e.target)
      }
    })
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
  document.querySelectorAll('[data-reveal]').forEach(function (el) { seen.observe(el) })

  // Anything already on screen at load comes in at once, so the first frame is never empty for long.
  requestAnimationFrame(function () {
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      var r = el.getBoundingClientRect()
      if (r.top < window.innerHeight) el.classList.add('in')
    })
  })

  var stage = document.querySelector('[data-shutter]')
  if (stage && stage.animate) {
    stage.animate(
      [{ transform: 'translateX(14%)', opacity: 0.2 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: 1100, easing: 'cubic-bezier(0.2, 0.7, 0.1, 1)', fill: 'backwards', delay: 120 }
    )
    var inner = stage.firstElementChild
    if (inner && inner.animate) {
      inner.animate(
        [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 900, easing: 'cubic-bezier(0.2, 0.7, 0.1, 1)', fill: 'backwards', delay: 520 }
      )
    }
  }

  // One slow drift on the large pictures while they cross the screen.
  var drift = document.querySelectorAll('[data-drift] img')
  if (drift.length) {
    var tick = function () {
      drift.forEach(function (img) {
        var r = img.getBoundingClientRect()
        var p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight
        img.style.transform = 'scale(1.06) translateY(' + (p * -18).toFixed(1) + 'px)'
      })
    }
    window.addEventListener('scroll', function () { requestAnimationFrame(tick) }, { passive: true })
    tick()
  }
})()
