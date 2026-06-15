export { FrontendStyleInjector } from "./style-injector";
export { FrontendComponentInjector } from "./component-injector";
export { FrontendEvaluationCalculator } from "./evaluation-calculator";
export { FrontendSidebarInjector } from "./sidebar-injector";

// Re-export use cases that depend on frontend infrastructure
export { InjectEvaluationsUseCase } from "../../application/usecases/inject-evaluations.usecase";
export { AddToSidebarUseCase } from "../../application/usecases/add-to-sidebar.usecase";
