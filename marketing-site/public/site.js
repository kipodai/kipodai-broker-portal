const options = {
  supply: ['See supply before it becomes a sales story.', 'Connect planned shipments, on-hand inventory, and retailer availability to spot the next risk early.', '97.8%', 'in-stock health'],
  growth: ['Find the momentum worth leaning into.', 'See the markets and customer segments where velocity is building—and where to invest next.', '+18.4%', 'velocity momentum'],
  focus: ['Turn noise into a focused next move.', 'Surface the exceptions that matter, with enough context for your team to act quickly.', '3', 'DCs below WoS']
};
if (['/client-portal', '/login'].includes(window.location.pathname)) {
  document.querySelector('main').innerHTML = `<section class="access"><img class="access-mascot" src="/hedgehog-door.png" alt="" /><div><h1>Your reports are ready.</h1><a class="button" href="https://shiftretailgroup.kipodai.com/login">Sign in →</a><small><a href="mailto:hello@kipodai.com?subject=KipodAI%20client%20portal%20access">Contact KipodAI →</a></small></div></section>`;
} else document.querySelectorAll('.tabs button').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('.tabs button.active').classList.remove('active'); button.classList.add('active');
  const [title, copy, number, label] = options[button.dataset.key];
  const answer = document.querySelector('.answer'); answer.querySelector('h3').textContent = title; answer.querySelector('span').textContent = copy; answer.querySelector('strong').innerHTML = `${number} <small>${label}</small>`;
}));
