const scenes = [...document.querySelectorAll('.scene')];
const play = document.querySelector('#play');
const clock = document.querySelector('#clock');
const stage = document.querySelector('#stage');
const progress = document.querySelector('.progress i');
let startedAt = null;
let frame = null;
let isPlaying = false;

function render(elapsed) {
  const clamped = Math.min(elapsed, 90);
  const index = Math.min(scenes.length - 1, Math.floor(clamped / 18));
  scenes.forEach((scene, i) => scene.classList.toggle('active', i === index));
  progress.style.width = `${(clamped / 90) * 100}%`;
  const seconds = Math.floor(clamped);
  clock.textContent = `0:${String(seconds).padStart(2, '0')} / 1:30`;
  stage.textContent = `${index + 1} of ${scenes.length}`;
  if (clamped >= 90) { isPlaying = false; play.innerHTML = 'Replay walkthrough <b>▶</b>'; return; }
  if (isPlaying) frame = requestAnimationFrame((now) => render((now - startedAt) / 1000));
}

play.addEventListener('click', () => {
  if (isPlaying) { isPlaying = false; play.innerHTML = 'Resume walkthrough <b>▶</b>'; return; }
  const current = parseFloat(progress.style.width || '0') / 100 * 90;
  if (current >= 90) progress.style.width = '0%';
  startedAt = performance.now() - (current >= 90 ? 0 : current * 1000);
  isPlaying = true;
  play.innerHTML = 'Pause walkthrough <b>Ⅱ</b>';
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame((now) => render((now - startedAt) / 1000));
});
