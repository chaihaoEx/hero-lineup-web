/// <reference lib="webworker" />
import { runSimulation, type SimulationWorkerInput } from "../core/simulationCore";

interface StartMessage {
  type: "start";
  requestId: string;
  input: SimulationWorkerInput;
}

self.addEventListener("message", (event: MessageEvent<StartMessage>) => {
  if (event.data.type !== "start") return;
  const { requestId, input } = event.data;
  try {
    const result = runSimulation(input, (completed, total) => {
      self.postMessage({ type: "progress", requestId, completed, total });
    });
    self.postMessage({ type: "complete", requestId, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export {};
