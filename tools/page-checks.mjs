// Проверки, выполняемые ВНУТРИ браузера: вёрстка и доступность.
// Отдельный модуль, потому что его используют два инструмента — screens.mjs (снимает экраны)
// и selfcheck.mjs (проверяет, что сами проверки не пустые). Функция передаётся в
// addInitScript, поэтому обязана быть самодостаточной: никаких внешних ссылок внутри.

export // Автопроверка вёрстки прямо в браузере: обрезанный текст, вылезание за край, мелкий шрифт,
// маленькие кнопки. Глаз это пропускает, замер — нет.
const CHECK_LAYOUT = () => {
  window.checkLayout = () => {
    const out = [];
    const seen = new Set();
    const name = (el) => el.tagName.toLowerCase()
      + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    const say = (msg) => { if (!seen.has(msg)) { seen.add(msg); out.push(msg); } };

    for (const el of document.querySelectorAll('#screen *, nav#tabs *, .overlay *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;

      // Обрезанный текст: содержимое шире/выше рамки при скрытом переполнении.
      const clipsX = cs.overflowX !== 'visible', clipsY = cs.overflowY !== 'visible';
      if (el.children.length === 0 && el.textContent.trim()) {
        if (clipsX && el.scrollWidth > el.clientWidth + 1) say(`обрезан текст по ширине: ${name(el)} — «${el.textContent.trim().slice(0, 24)}»`);
        if (clipsY && el.scrollHeight > el.clientHeight + 1) say(`обрезан текст по высоте: ${name(el)} — «${el.textContent.trim().slice(0, 24)}»`);
      }
      // Вылезание за края экрана.
      if (r.left < -1 || r.right > innerWidth + 1) say(`выходит за край экрана: ${name(el)} (${Math.round(r.left)}…${Math.round(r.right)} при ширине ${innerWidth})`);

      // Размер шрифта и площадь нажатия — жёсткие требования доступности.
      const fs = parseFloat(cs.fontSize);
      if (el.textContent.trim() && el.children.length === 0 && fs < 17) say(`мелкий шрифт ${fs}px: ${name(el)}`);
      if ((el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') && r.height < 44 && r.height > 0) say(`низкая кнопка ${Math.round(r.height)}px: ${name(el)}`);
    }
    return out;
  };

  // Доступность: экранный диктор и клавиатура. Папа пользуется пальцем, но зрение
  // с возрастом слабеет — рано или поздно понадобится увеличение и озвучивание.
  window.checkA11y = () => {
    const out = [];
    const seen = new Set();
    const say = (msg) => { if (!seen.has(msg)) { seen.add(msg); out.push(msg); } };
    const named = (el) => {
      const aria = (el.getAttribute('aria-label') || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      // Текст без учёта скрытого от диктора (aria-hidden) содержимого — иконки им помечены.
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      return aria || title || clone.textContent.trim();
    };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    };

    if (document.documentElement.lang !== 'ru') say('у страницы не указан язык (lang)');

    const ids = {};
    for (const el of document.querySelectorAll('[id]')) {
      ids[el.id] = (ids[el.id] || 0) + 1;
      if (ids[el.id] === 2) say(`повторяющийся id: ${el.id}`);
    }

    for (const el of document.querySelectorAll('img')) {
      if (!visible(el)) continue;
      if (el.getAttribute('alt') === null) say(`картинка без атрибута alt: ${el.getAttribute('src')}`);
    }

    for (const el of document.querySelectorAll('button, [role="button"], a[href]')) {
      if (!visible(el)) continue;
      if (!named(el)) say(`элемент без доступного названия: ${el.tagName.toLowerCase()}#${el.id || '—'}.${el.className}`);
    }

    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (!visible(el) || el.type === 'hidden') continue;
      const byFor = el.id && document.querySelector(`label[for="${el.id}"]`);
      const wrapped = el.closest('label');
      if (!byFor && !wrapped && !el.getAttribute('aria-label')) {
        say(`поле без подписи: ${el.type}#${el.id || '—'}`);
      }
    }

    // Порядок заголовков: пропуск уровня сбивает навигацию диктором.
    const levels = [...document.querySelectorAll('#screen h1, #screen h2, #screen h3')]
      .filter(visible).map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) say(`пропущен уровень заголовка: h${levels[i - 1]} → h${levels[i]}`);
    }

    // Клавиатура: у каждого экрана должен быть хоть один элемент, на который можно встать.
    const focusable = [...document.querySelectorAll('#screen button, #screen input, #screen [tabindex]:not([tabindex="-1"]), nav#tabs button')]
      .filter(visible);
    if (!focusable.length) say('на экране нет ни одного элемента, доступного с клавиатуры');

    return out;
  };
};
