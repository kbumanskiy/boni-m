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

  // Подпись и её поле/кнопки в одном блоке не должны наезжать друг на друга. Поле при фокусе
  // рисует обводку (3px + отступ 3px), поэтому подпись должна стоять не ближе RING от рамки поля:
  // раньше «Как вас зовут?» упиралась в поле, и обводка лезла на буквы (первый экран).
  // Возвращает {pairs: сколько пар «подпись — элемент» измерено, problems}.
  window.checkLabels = () => {
    const RING = 6, problems = [], seen = new Set();
    let pairs = 0;
    const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const nm = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
    for (const label of document.querySelectorAll('#screen label, .overlay label')) {
      if (!vis(label)) continue;
      const block = label.closest('.card, form') || label.parentElement;
      const lr = label.getBoundingClientRect();
      for (const el of block.querySelectorAll('input, select, textarea, button')) {
        if (el === label || label.contains(el) || !vis(el) || el.type === 'hidden') continue;
        pairs++;
        const er = el.getBoundingClientRect();
        // Кнопки и ползунки: рамка у них своя (ползунок рисуется внутри 44px), запас под обводку не нужен.
        const ring = el.tagName === 'BUTTON' || el.type === 'range' ? 0 : RING;
        const x = Math.min(lr.right, er.right + ring) - Math.max(lr.left, er.left - ring);
        const y = Math.min(lr.bottom, er.bottom + ring) - Math.max(lr.top, er.top - ring);
        if (x > 1 && y > 1) {
          const msg = `подпись «${label.textContent.trim().slice(0, 24)}» наезжает на ${nm(el)} (зазор ${Math.round(er.top - lr.bottom)}px, нужно от ${ring})`;
          if (!seen.has(msg)) { seen.add(msg); problems.push(msg); }
        }
      }
    }
    return { pairs, problems };
  };

  // Кнопки, которые обязаны стоять целиком выше нижнего меню без прокрутки (кадр learnsilent:
  // надпись «Звук не включился» не должна выдавить «Послушать ещё раз» и сетку букв под меню).
  window.checkAboveNav = (selectors) => {
    const nav = document.querySelector('nav#tabs');
    const top = nav ? nav.getBoundingClientRect().top : innerHeight;
    return selectors.flatMap((sel) => {
      const el = document.querySelector(sel);
      if (!el) return [`нет элемента ${sel} для замера над меню`];
      const b = el.getBoundingClientRect().bottom;
      return b > top + 0.5 ? [`${sel} уходит под нижнее меню (низ ${Math.round(b)}, меню с ${Math.round(top)})`] : [];
    });
  };

  // Ничего не выходит из своей карточки (критерий 1 чистки оформления, 20.10.2026):
  // «Дальше» в разборе ошибки торчала из карточки на 390 точках, а замер «за край экрана»
  // этого не видит — до края там ещё оставалось место. Пока включён только для экрана
  // «Учиться» (screens.mjs, кадры learn*); на остальные экраны — по мере их чистки.
  window.checkInsideCards = () => {
    const out = [], seen = new Set();
    const nm = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    for (const card of document.querySelectorAll('#screen .card')) {
      const cs = getComputedStyle(card);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const c = card.getBoundingClientRect();
      for (const el of card.querySelectorAll('*')) {
        const ecs = getComputedStyle(el);
        if (ecs.display === 'none' || ecs.visibility === 'hidden' || ecs.position === 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        if (r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1) {
          const msg = `выходит из карточки: ${nm(el)} (${Math.round(r.left)}…${Math.round(r.right)}, карточка ${Math.round(c.left)}…${Math.round(c.right)})`;
          if (!seen.has(msg)) { seen.add(msg); out.push(msg); }
        }
      }
    }
    return out;
  };

  // Нижнее меню (критерий 6, 23.10.2026): подписи не выходят из своих кнопок и между
  // соседними подписями одного ряда есть видимый зазор (GAP). Подпись — голый текст внутри
  // кнопки без обрезки, поэтому замер «за край экрана» не видел «ГлавнаяУчиться».
  // На компьютере меню не растягивается от края до края, а стоит по ширине содержимого.
  window.checkNav = () => {
    const GAP = 8, out = [];
    const nav = document.querySelector('nav#tabs');
    if (!nav || getComputedStyle(nav).display === 'none') return out;
    const labels = [...nav.querySelectorAll('button')].map((b) => {
      const t = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      const range = document.createRange(); range.selectNodeContents(t);
      return { name: t.textContent.trim(), r: range.getBoundingClientRect(), b: b.getBoundingClientRect() };
    });
    for (const l of labels) {
      if (l.r.left < l.b.left - 0.5 || l.r.right > l.b.right + 0.5)
        out.push(`подпись меню «${l.name}» выходит из кнопки (${Math.round(l.r.left)}…${Math.round(l.r.right)}, кнопка ${Math.round(l.b.left)}…${Math.round(l.b.right)})`);
    }
    for (let i = 1; i < labels.length; i++) {
      const a = labels[i - 1], b = labels[i];
      if (Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) <= 0) continue;   // разные ряды
      if (b.r.left - a.r.right < GAP)
        out.push(`подписи меню слиплись: «${a.name}» и «${b.name}» (зазор ${Math.round(b.r.left - a.r.right)}px, нужно от ${GAP})`);
    }
    const w = nav.getBoundingClientRect().width;
    if (innerWidth >= 900 && w > 700) out.push(`меню растянуто на ${Math.round(w)}px при экране ${innerWidth}`);
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
      // aria-labelledby — законный способ назвать элемент: имя берётся из чужого текста.
      // Так подписаны тумблеры в настройках: подпись слева, сам переключатель справа.
      const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent.trim() || '').join(' ').trim();
      if (by) return by;
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

// Шрифт нижнего меню в кадрах и в selfcheck — Roboto, как на Android (см. screens.mjs, FONTS).
// Файл отдаёт тестовый сервер по адресу /__fonts/.
export const NAV_FONT_CSS = '@font-face{font-family:"Roboto Android";src:url(/__fonts/roboto-cyrillic-400-normal.woff2)}'
  + 'nav#tabs button{font-family:"Roboto Android",var(--font)}';
