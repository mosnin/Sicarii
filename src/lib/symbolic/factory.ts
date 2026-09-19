// Foreman (thruwire/foreman): Jev estimates nine nouls. Code decides the
// intervention. Safety before productivity. Add to Scalar's symbolic layer.

export const FACTORY_NOULS = {
  implementationComplete: "Is the work required by the original job complete?",
  testsSufficient: "Is there sufficient relevant verification, passing?",
  requirementsSatisfied: "Does current state satisfy the original job as a whole?",
  needsVerification: "Does this warrant an independent verification pass?",
  meaningfulProgress: "Is the active worker making meaningful progress?",
  workerStuck: "Is the worker stuck, looping, or unable to advance?",
  workOffTrack: "Is work drifting from the original job?",
  readyToFinish: "Given all evidence, is the job ready to declare complete?",
  needsHuman: "Does this need human judgment, credentials, clarification, or permission?",
} as const;

export type FactoryNoulKey = keyof typeof FACTORY_NOULS;

export type FactoryIntervention =
  | "ESCALATE"
  | "STEER_WORKER"
  | "STOP_WORKER"
  | "RETRY_WORKER"
  | "FINISH"
  | "START_VERIFIER"
  | "START_WORKER"
  | "CONTINUE";

export type FactoryState = {
  active: boolean;
  verified: boolean;
  verifyStarted: boolean;
  iteration: number;
  maxIterations: number;
  last?: FactoryIntervention;
  steeredAt?: number;
};

export type FactoryConfig = {
  human: number;
  offTrack: number;
  stuck: number;
  finish: number;
  reqs: number;
  tests: number;
  verify: number;
  implForVerify: number;
  steerGrace: number;
  maxSteers: number;
  maxRetries: number;
};

export const DEFAULT_FACTORY_CONFIG: FactoryConfig = {
  human: 0.75,
  offTrack: 0.7,
  stuck: 0.75,
  finish: 0.8,
  reqs: 0.8,
  tests: 0.7,
  verify: 0.7,
  implForVerify: 0.7,
  steerGrace: 1,
  maxSteers: 2,
  maxRetries: 1,
};

export function factoryPolicy(
  state: FactoryState,
  answers: Record<FactoryNoulKey, number>,
  config: FactoryConfig = DEFAULT_FACTORY_CONFIG,
): FactoryIntervention {
  if (answers.needsHuman >= config.human) return "ESCALATE";
  if (state.iteration >= state.maxIterations) return "ESCALATE";

  if (state.active && (answers.workOffTrack >= config.offTrack || answers.workerStuck >= config.stuck)) {
    const steers = state.steeredAt ?? 0;
    if (steers < config.steerGrace) return "CONTINUE";
    return steers < config.maxSteers ? "STEER_WORKER" : "STOP_WORKER";
  }

  if (!state.active && state.last === "STOP_WORKER") {
    return (state.steeredAt ?? 0) < config.maxRetries ? "RETRY_WORKER" : "ESCALATE";
  }

  const finish =
    answers.readyToFinish >= config.finish &&
    answers.requirementsSatisfied >= config.reqs &&
    answers.testsSufficient >= config.tests;
  if (!state.active && finish && (state.verified || answers.needsVerification < config.verify)) {
    return "FINISH";
  }
  if (
    !state.active &&
    answers.needsVerification >= config.verify &&
    answers.implementationComplete >= config.implForVerify &&
    !state.verifyStarted
  ) {
    return "START_VERIFIER";
  }
  if (!state.active) return "START_WORKER";
  return "CONTINUE";
}
