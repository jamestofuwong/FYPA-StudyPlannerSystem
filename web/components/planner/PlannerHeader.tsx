import styles from './Planner.module.css';

type PlannerHeaderProps = {
    course: string;
    major: string;
    intake: string;
    intakeYear: string | number;
    requirements: {
        core: { count: number | null; cp: number | null };
        majorReq: { count: number | null; cp: number | null };
        elective: { count: number | null; cp: number | null };
        wil: { count: number | null; cp: number | null };
    };
    editable?: boolean;
    onEdit?: (field: string, subField?: string, value?: string | number | null) => void;
};

function formatRequirement(value: { count: number | null; cp: number | null }): string {
    const count = value.count ?? '-';
    const cp = value.cp ?? '-';
    return `${count} units / ${cp} cp`;
}

export default function PlannerHeader({ course, major, intake, intakeYear, requirements, editable, onEdit }: PlannerHeaderProps) {
    return (
        <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Course</span>
                {editable && onEdit ? (
                    <div contentEditable suppressContentEditableWarning className={styles.editTextarea}
                    onBlur={(e) => onEdit('course', undefined, e.currentTarget.textContent || '')}>
                        {course}
                    </div>
                ) : (
                    <span className={styles.summaryValue}>{course}</span>
                )}
            </div>
            <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Major</span>
                {editable && onEdit ? (
                    <div contentEditable suppressContentEditableWarning className={styles.editTextarea}
                    onBlur={(e) => onEdit('major', undefined, e.currentTarget.textContent || '')}>
                        {major}
                    </div>
                ) : (
                    <span className={styles.summaryValue}>{major}</span>
                )}
            </div>
            <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Intake</span>
                {editable && onEdit ? (
                    <input type="text" value={intake} onChange={(e) => onEdit('intake', undefined, e.target.value)} className={styles.editInput} />
                ) : (
                    <span className={styles.summaryValue}>{intake}</span>
                )}
            </div>
            <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Intake Year</span>
                {editable && onEdit ? (
                    <input 
                        type="number" 
                        value={intakeYear ?? ''} 
                        onKeyDown={(e) => {
                            if (['e', 'E', '+', '-'].includes(e.key)){
                                e.preventDefault();
                            }
                        }}
                        onChange={(e) => {
                            const val = e.target.value;
                            onEdit('intakeYear', undefined, val === '' ? null : parseInt(val));
                        }} 
                        className={styles.editInput} 
                    />
                ) : (
                    <span className={styles.summaryValue}>{intakeYear}</span>
                )}
            </div>
            {['core', 'majorReq', 'elective', 'wil'].map((key) => {
                const req = requirements[key as keyof typeof requirements];
                const label = key === 'majorReq' ? 'Major' : key.charAt(0).toUpperCase() + key.slice(1);
                return (
                    <div className={styles.summaryItem} key={key}>
                        <span className={styles.summaryLabel}>{label}</span>
                        {editable && onEdit ? (
                            <div className={styles.summaryEditRow}>
                            <input type="number"
                                value={req.count ?? ''}
                                onKeyDown={(e) => {
                                    if (['e', 'E', '+', '-'].includes(e.key)){
                                        e.preventDefault();
                                    }
                                }}
                                onChange={(e) => onEdit(key, 'count', e.target.value ? parseInt(e.target.value) : null)} 
                                className={styles.editInput} 
                                placeholder="-" 
                            />
                            <span className={styles.editUnit}>units</span>
                            <span className={styles.editSeparator}>/</span>
                            <input type="number" 
                                value={req.cp ?? ''}
                                onKeyDown={(e) => {
                                    if (['e', 'E', '+', '-'].includes(e.key)){
                                        e.preventDefault();
                                    }
                                }}
                                onChange={(e) => onEdit(key, 'cp', e.target.value ? parseInt(e.target.value) : null)} 
                                className={styles.editInput} 
                                placeholder="-" 
                            />
                            <span className={styles.editUnit}>cp</span>
                            </div>
                        ) : (
                            <span className={styles.summaryValue}>{formatRequirement(req)}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}