/** Each UI request owns a ticket; superseded tickets cannot update the UI. */
export class LatestRequest {
  private controller?: AbortController;
  begin() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    return {
      signal: controller.signal,
      isCurrent: () => this.controller === controller && !controller.signal.aborted,
      cancel: () => controller.abort(),
    };
  }

  schedule(run: (ticket: ReturnType<LatestRequest["begin"]>) => void, delay: number) {
    const ticket = this.begin();
    const timer = setTimeout(() => {
      if (ticket.isCurrent()) run(ticket);
    }, delay);
    return () => { clearTimeout(timer); ticket.cancel(); };
  }
}
