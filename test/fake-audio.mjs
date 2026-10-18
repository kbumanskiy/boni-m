// Поддельный AudioContext для дымовых тестов (JSDOM): звука нет, но часы идут.
//
// Зачем. Раньше smoke-тесты ставили window.AudioContext = undefined, и приложение
// считало каждый знак «прозвучавшим» мгновенно. После раздела 10 ТЗ длинных радиограмм
// это означает «звука нет» — «Учиться» и радиограмма честно уходят в «Звук не включился».
// Поэтому обычные сценарии идут на поддельном контексте, который «работает».
//
// Два режима:
//   • быстрый (по умолчанию) — часы идут от performance.now() в speed раз быстрее (×1000):
//     знак на 18 WPM звучит за доли миллисекунды, радиограмма из 50 групп — за секунду-другую;
//   • ручной (manual: true) — часы стоят, пока тест сам не передвинет currentTime.
//     Так «передача идёт» держится ровно столько, сколько велит тест.
// Поле state изменяемое: тест может «усыпить» уже созданный контекст (state = 'suspended')
// и запретить ему просыпаться (resumeHangs = true) — модуль звука держит контекст между
// экранами, и подменой конструктора этого не добиться.
//
// Тестов в файле нет; node --test его тоже запустит — безвредно.

export function makeFakeAudio({ speed = 1000, manual = false } = {}) {
  const instances = [];
  let oscillators = 0;
  // Журнал тонов: частота, начало и длительность. По нему тест «слушает» знак: восстанавливает
  // код по длительностям, как человек на слух. Подсказки ответа в приложение это не добавляет.
  const tones = [];

  class Param {
    constructor() { this.value = 0; }
    setValueAtTime(v) { this.value = v; return this; }
    linearRampToValueAtTime(v) { this.value = v; return this; }
    cancelScheduledValues() { return this; }
  }
  class Node { connect(next) { return next; } disconnect() {} }

  class FakeAudioContext {
    constructor() {
      this._state = 'running';
      this._base = 1;                       // часы стартуют не с нуля, как у настоящего контекста
      this._since = performance.now();
      this._manualTime = 1;
      this.resumeHangs = false;
      this.destination = new Node();
      instances.push(this);
    }
    get state() { return this._state; }
    set state(v) {
      // Перед сменой состояния фиксируем пройденное время: у спящего контекста часы стоят.
      this._base = this.currentTime; this._since = performance.now(); this._state = v;
    }
    get currentTime() {
      if (manual) return this._manualTime;
      if (this._state !== 'running') return this._base;
      return this._base + ((performance.now() - this._since) * speed) / 1000;
    }
    set currentTime(t) { this._manualTime = t; }
    resume() {
      if (this.resumeHangs) return new Promise(() => {});
      if (this._state !== 'running') this.state = 'running';
      return Promise.resolve();
    }
    close() { return Promise.resolve(); }
    createOscillator() {
      oscillators++;
      const rec = { freq: 0, start: 0, dur: 0 };
      const osc = Object.assign(new Node(), {
        type: 'sine', frequency: new Param(), onended: null,
        start(t) { rec.freq = osc.frequency.value; rec.start = t; tones.push(rec); },
        // stop(t) со временем — плановый конец тона (+0,01 с запаса, как в audio.js).
        stop(t) { if (t !== undefined && !rec.dur) rec.dur = t - 0.01 - rec.start; },
      });
      return osc;
    }
    createGain() { return Object.assign(new Node(), { gain: new Param() }); }
  }

  // Код последнего проигранного знака заданной частоты: точка или тире по длительности.
  // Знак — цепочка тонов, где каждый следующий начинается ровно через паузу в точку
  // после конца предыдущего; так знак отделяется от прошлых проигрываний.
  function lastCode(toneHz, charWpm) {
    const mine = tones.filter((t) => t.freq === toneHz && t.dur > 0);
    if (!mine.length) return '';
    const dit = 1.2 / charWpm;
    const chain = [mine.at(-1)];
    for (let i = mine.length - 2; i >= 0; i--) {
      const prev = mine[i], cur = chain[0];
      if (Math.abs(prev.start + prev.dur + dit - cur.start) < 1e-6) chain.unshift(prev); else break;
    }
    return chain.map((t) => (t.dur > 2 * dit ? '-' : '.')).join('');
  }

  return {
    AudioContext: FakeAudioContext,
    instances,
    tones,
    lastCode,
    get last() { return instances.at(-1) || null; },
    get oscillators() { return oscillators; },
  };
}
