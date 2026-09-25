/* ────────────────────────────────────────────────────────────
   TouchDesigner ↔ 웹 브리지 (WebSocket)
   TouchDesigner 의 Web Server DAT(포트 9980)가 손 제스처를 JSON 으로 보냅니다.
     TD → 웹 : {"type":"cursor","x":0.4,"y":0.6} · {"type":"swipe","dir":"right"} · {"type":"pinchstart"} …
               {"type":"filter","index":3} · {"type":"mode","mode":"map"} · {"type":"key","key":"Tab"}
     웹 → TD : {"type":"filter","index":3,"name":"페이퍼 스케치"} · {"type":"state","mode":"map"} · {"type":"hello",…}
   https 로 배포된 페이지에서도 Chrome 은 ws://localhost 연결을 허용합니다.
   다른 주소를 쓰려면  ?td=ws://192.168.0.10:9980
   ──────────────────────────────────────────────────────────── */
export class TDBridge {
  constructor(url, { onEvent, onStatus }) {
    this.url = url;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.enabled = false;
    this.open = false;
    this.retry = 1000;
  }

  connect() {
    this.enabled = true;
    try { this.ws = new WebSocket(this.url); } catch (e) { this.schedule(); return; }
    this.ws.onopen = () => { this.open = true; this.retry = 1000; this.onStatus?.(true); };
    this.ws.onmessage = (ev) => {
      let msgs;
      try { msgs = JSON.parse(ev.data); } catch { return; }
      for (const m of Array.isArray(msgs) ? msgs : [msgs]) if (m && m.type) this.onEvent?.(m);
    };
    this.ws.onclose = () => {
      const was = this.open;
      this.open = false;
      if (was) this.onStatus?.(false);
      if (this.enabled) this.schedule();
    };
    this.ws.onerror = () => {};
  }

  schedule() {
    clearTimeout(this.t);
    this.t = setTimeout(() => this.enabled && this.connect(), this.retry);
    this.retry = Math.min(this.retry * 1.6, 8000);
  }

  send(obj) {
    if (this.open) this.ws.send(JSON.stringify(obj));
  }

  disconnect() {
    this.enabled = false;
    clearTimeout(this.t);
    this.ws?.close();
    this.open = false;
    this.onStatus?.(false);
  }
}
