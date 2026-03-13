import PlaceholderPanel from '../PlaceholderPanel';

export function DashboardPanel() {
    return (
        <PlaceholderPanel
            icon="🎓"
            title="Dashboard"
            panelId="dashboard"
            accentColor="var(--accent-blue)"
            description="The main student overview. Displays detected majors, unit completion progress, advisory plans, and at-risk student alerts for all students under your faculty."
            features={[
                'Major Detection',
                'Advisory Plan',
                'Unit Progress',
                'All Students',
                'GPA Tracking',
                'Missing Units',
            ]}
            cards={[
                {
                    icon: '🎓',
                    title: 'Major Detection',
                    desc: 'Auto-detect student major by matching completed units against official study planners.',
                },
                {
                    icon: '📋',
                    title: 'Advisory Plan',
                    desc: 'Generate recommended enrollment paths based on detected major and missing units.',
                },
                {
                    icon: '📈',
                    title: 'Unit Progress',
                    desc: 'Visualise completion status per semester with bar charts and progress indicators.',
                },
                {
                    icon: '👥',
                    title: 'All Students',
                    desc: 'Browse and filter all 81 students with quick status indicators and GPA overview.',
                },
            ]}
        />
    );
}

export function PlannersPanel() {
    return (
        <PlaceholderPanel
            icon="📄"
            title="Planners"
            panelId="planners"
            accentColor="var(--accent-purple)"
            description="View and manage the official study planner database. Inspect unit codes, prerequisites, and credit hours across all programmes and academic years."
            features={[
                'View Planners',
                'Unit Lookup',
                'Prerequisite Graph',
                'Planner Config',
            ]}
            cards={[
                {
                    icon: '📋',
                    title: 'View Planners',
                    desc: 'Browse all loaded study planner PDFs and their parsed unit structures per programme.',
                },
                {
                    icon: '🔍',
                    title: 'Unit Lookup',
                    desc: 'Search any unit by code or name across all programmes and academic years.',
                },
                {
                    icon: '⚙️',
                    title: 'Planner Config',
                    desc: 'Configure core/elective/MPU weights and rules used for major detection scoring.',
                },
            ]}
        />
    );
}

export function ImportPanel() {
    return (
        <PlaceholderPanel
            icon="📥"
            title="Data Import"
            panelId="import"
            accentColor="var(--accent-green)"
            description="Import student enrollment data via web scraping from the university portal, or upload official study planner PDFs for OCR processing."
            features={[
                'PDF Upload',
                'OCR Engine',
                'Portal Scraping',
                'Planner Review',
                'Import History',
            ]}
            cards={[
                {
                    icon: '📤',
                    title: 'Import PDF Planner',
                    desc: 'Drag & drop official study planner PDFs. The OCR engine extracts unit codes and prerequisites.',
                },
                {
                    icon: '🕷️',
                    title: 'Portal Scraping',
                    desc: 'Authenticate with the university portal and automatically scrape all student enrollment records.',
                },
                {
                    icon: '✅',
                    title: 'Planner Review',
                    desc: 'Review OCR output before committing to the database. Flag low-confidence entries for manual correction.',
                },
            ]}
        />
    );
}

export function ExportPanel() {
    return (
        <PlaceholderPanel
            icon="📤"
            title="Export"
            panelId="export"
            accentColor="var(--accent-yellow)"
            description="Export student records, advisory plans, major analysis, and analytics summaries to Excel workbooks. Schedule automated exports for regular reporting."
            features={[
                'Dashboard Report',
                'Advisory Plans',
                'Student Data',
                'Analytics',
                'Planner DB',
                'Scheduled Export',
            ]}
            cards={[
                {
                    icon: '📊',
                    title: 'Dashboard Report',
                    desc: 'Export major detection results and completion stats for all students.',
                },
                {
                    icon: '📋',
                    title: 'Advisory Plans',
                    desc: 'Generate per-student Excel advisory plans with recommended enrollment paths.',
                },
                {
                    icon: '📈',
                    title: 'Analytics Report',
                    desc: 'Cohort-level GPA trends, at-risk counts, and major distribution summaries.',
                },
                {
                    icon: '📅',
                    title: 'Scheduled Export',
                    desc: 'Configure automatic export jobs to run nightly or at the end of each semester.',
                },
            ]}
        />
    );
}