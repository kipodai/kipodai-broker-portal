document.querySelectorAll('.product-showcase').forEach((showcase) => {
  const buttons = [...showcase.querySelectorAll('[data-product]')];
  const panels = [...showcase.querySelectorAll('[data-panel]')];
  function show(button) {
    buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== button.dataset.product; });
  }
  buttons.forEach((button) => button.addEventListener('click', () => show(button)));
  const selected = new URLSearchParams(location.search).get('product');
  const initial = buttons.find((button) => button.dataset.product === selected);
  if (initial) show(initial);
});
