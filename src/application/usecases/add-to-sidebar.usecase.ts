import type { SidebarInjector } from '../ports';
import AnalysisSidebarContent from '../../ui/components/AnalysisSidebarContent.svelte';

export class AddToSidebarUseCase {
    constructor(private sidebarInjector: SidebarInjector) { }

    execute(component: any, props: any, title: string, icon?: string) {
        this.sidebarInjector.injectIntoSidebar(component, props, title, icon);
    }

    showAnalysisSidebar(feedbackData: any, icon?: string) {
        this.sidebarInjector.injectIntoSidebar(
            AnalysisSidebarContent,
            { feedbackData },
            "Analysis Report",
            icon
        );
    }
}
