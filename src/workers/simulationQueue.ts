import type { SimulationWorkerInput } from "../core/simulationCore";
import type { SimulationProgress, SimulationResult } from "../types/domain";

type WorkerReply = {
  type: "progress" | "complete" | "error";
  requestId: string;
  completed?: number;
  total?: number;
  result?: SimulationResult;
  message?: string;
};

type Job = {
  requestId: string;
  taskId: string;
  input: SimulationWorkerInput;
  total: number;
  signal: AbortSignal;
  onProgress: (progress: SimulationProgress) => void;
  resolve: (result: SimulationResult) => void;
  reject: (cause: unknown) => void;
  abort: () => void;
};

export class SimulationQueue {
  private pending: Job[] = [];
  private active: { job: Job; worker: Worker } | undefined;

  enqueue(
    taskId: string,
    input: SimulationWorkerInput,
    onProgress: (progress: SimulationProgress) => void,
    signal: AbortSignal,
  ): Promise<SimulationResult> {
    if (signal.aborted) return Promise.reject(new DOMException("模拟已取消", "AbortError"));
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const job: Job = {
        requestId,
        taskId,
        input,
        total: input.task.config.iterations,
        signal,
        onProgress,
        resolve,
        reject,
        abort: () => this.cancel(requestId),
      };
      signal.addEventListener("abort", job.abort, { once: true });
      if (this.active || this.pending.length) {
        onProgress({ taskId, completed: 0, total: job.total, phase: "queued" });
      }
      this.pending.push(job);
      this.pump();
    });
  }

  private cancel(requestId: string): void {
    const pendingIndex = this.pending.findIndex((job) => job.requestId === requestId);
    if (pendingIndex >= 0) {
      const [job] = this.pending.splice(pendingIndex, 1);
      if (job) {
        job.signal.removeEventListener("abort", job.abort);
        job.reject(new DOMException("模拟已取消", "AbortError"));
      }
      return;
    }
    if (this.active?.job.requestId !== requestId) return;
    const { job, worker } = this.active;
    this.active = undefined;
    worker.terminate();
    job.signal.removeEventListener("abort", job.abort);
    job.reject(new DOMException("模拟已取消", "AbortError"));
    this.pump();
  }

  private finish(job: Job, worker: Worker, action: () => void): void {
    if (this.active?.job.requestId !== job.requestId) return;
    this.active = undefined;
    worker.terminate();
    job.signal.removeEventListener("abort", job.abort);
    action();
    this.pump();
  }

  private pump(): void {
    if (this.active) return;
    const job = this.pending.shift();
    if (!job) return;
    if (job.signal.aborted) {
      job.signal.removeEventListener("abort", job.abort);
      job.reject(new DOMException("模拟已取消", "AbortError"));
      this.pump();
      return;
    }
    const worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    this.active = { job, worker };
    worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
      if (event.data.requestId !== job.requestId) return;
      if (event.data.type === "progress") {
        job.onProgress({
          taskId: job.taskId,
          completed: event.data.completed ?? 0,
          total: event.data.total ?? job.total,
          phase: "running",
        });
        return;
      }
      if (event.data.type === "complete" && event.data.result) {
        this.finish(job, worker, () => job.resolve(event.data.result!));
      } else {
        this.finish(job, worker, () => job.reject(new Error(event.data.message ?? "模拟 Worker 返回无效结果")));
      }
    });
    worker.addEventListener("error", (event) => {
      this.finish(job, worker, () => job.reject(new Error(event.message || "模拟 Worker 执行失败")));
    }, { once: true });
    worker.postMessage({ type: "start", requestId: job.requestId, input: job.input });
  }
}

export const simulationQueue = new SimulationQueue();
