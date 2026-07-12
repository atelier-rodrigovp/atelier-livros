export class QualityBlockedError extends Error {
  readonly stage: string;
  readonly blockers: string[];
  constructor(stage: string, blockers: string[], message = "Qualidade bloqueada") {
    super(message);
    this.name = "QualityBlockedError";
    this.stage = stage;
    this.blockers = blockers;
  }
}

export class InfrastructureBlockedError extends Error {
  readonly dependency: string;
  constructor(dependency: string, message: string) {
    super(message);
    this.name = "InfrastructureBlockedError";
    this.dependency = dependency;
  }
}

export class InfrastructureRetryError extends Error {
  readonly dependency: string;
  constructor(dependency: string, message: string) {
    super(message);
    this.name = "InfrastructureRetryError";
    this.dependency = dependency;
  }
}
