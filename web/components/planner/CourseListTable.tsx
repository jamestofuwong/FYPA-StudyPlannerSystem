import styles from './Planner.module.css';
import type { PlannerImportUnit } from '@core/shared/types/plannerImport';

type SemesterGroup = {
    semester: number;
    label: string;
    list: PlannerImportUnit[];
    isEmpty: boolean;
};
    
type YearGroup = {
    year: number;
    label: string;
    semesters: SemesterGroup[];
    isEmpty: boolean;
};

type CourseListTableProps = {
    yearGroups: YearGroup[];
    emptyMessage?: string;
    editable?: boolean;
    onUnitEdit?: (unitCode: string, field: keyof PlannerImportUnit, value: string | number | null) => void;
    onAddUnit?: (year: number, semester: number) => void;
    onDeleteUnit?: (unitCode: string) => void;
    onAddSemester?: (year: number, semester: number, label: string) => void;
    intakeMonth?: number;
    unplacedElectives?: PlannerImportUnit[];
};

function categoryLabel(category: string | null): string {
    if (!category) return 'Unknown';
    return category.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function badgeClassForCategory(category: string | null): string {
    switch (category) {
        case 'core': return 'badgeBlue';
        case 'major_core': return 'badgeYellow';
        case 'mpu': return 'badgeRed';
        case 'wil': return 'badgePurple';
        case 'prescribed_elective': return 'badgeGreen';
        default: return 'badgeGreen';
    }
}

export function getSemesterOrder(intakeMonth: number): number[] {
  if (intakeMonth >= 2 && intakeMonth <= 3) {
    return [1, 4, 2, 3];
  } else if (intakeMonth >= 8 && intakeMonth <= 9) {
    return [1, 3, 2, 4];
  }
  return [1, 2, 3, 4];
}

export function getSemesterLabel(sem: number): string {
  switch (sem) {
    case 1: return 'Semester 1';
    case 2: return 'Semester 2';
    case 3: return 'Summer Term';
    case 4: return 'Winter Term';
    default: return `Semester ${sem}`;
  }
}

export default function CourseListTable({ 
    yearGroups, 
    emptyMessage = 'No units found.',
    editable = false,
    onUnitEdit,
    onAddUnit,
    onDeleteUnit,
    onAddSemester,
    intakeMonth = 0,
    unplacedElectives = []
}: CourseListTableProps) {
  
    const totalUnits = yearGroups.reduce((count, year) => {
        return count + year.semesters.reduce((sum, sem) => sum + sem.list.length, 0);
    }, 0);

    if (totalUnits === 0) {
        return <div className={styles.termEmpty}>{emptyMessage}</div>;
    }

    const semesterOrder = getSemesterOrder(intakeMonth);

    return (<>
        <div className={styles.sectionTitle}>Course List</div>
      
        {yearGroups.map(({ year, label, semesters, isEmpty: yearEmpty }, yearIndex) => {
            const existingSems = new Set(semesters.map(s => s.semester));
            const missingSems = semesterOrder.filter(s => !existingSems.has(s));
            
            return (
            <div key={year} className={styles.termGroup}>
                <div className={styles.termHeading}>
                    <span className={yearEmpty ? styles.termLabelEmpty : styles.termLabel}>{label}</span>
                    {yearEmpty && <span className={`${styles.badge} ${styles.badgeOrange}`}>No units</span>}
                    <div className={styles.termDivider} />
                </div>
          
                {semesters.map(({ semester, label: semLabel, list, isEmpty }, semIndex) => {
                    // Find missing semesters that should appear BEFORE this one
                    const currentOrderIndex = semesterOrder.indexOf(semester);
                    const missingBefore = missingSems.filter(s => semesterOrder.indexOf(s) < currentOrderIndex);
                    
                    return (
                    <div key={semester}>
                        {/* Add missing semesters before this one */}
                        {semIndex === 0 && missingBefore.map(ms => (
                            <div key={`missing-${ms}`} style={{ marginBottom: 12 }}>
                                <div className={styles.termHeading}>
                                    <span className={styles.termLabelEmpty}>{getSemesterLabel(ms)}</span>
                                    <span className={`${styles.badge} ${styles.badgeOrange}`}>No units</span>
                                    <div className={styles.termDivider} />
                                </div>
                                <div className={styles.termEmpty}>
                                    No units assigned this {getSemesterLabel(ms).toLowerCase()}.
                                    {editable && onAddSemester && (
                                        <button
                                            className={styles.addUnitBtn}
                                            style={{ marginTop: 8 }}
                                            onClick={() => onAddUnit!(year, ms)}
                                        >
                                            + Add Unit
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        <div style={{ marginBottom: isEmpty ? 12 : 20 }}>
                            <div className={styles.termHeading}>
                                <span className={isEmpty ? styles.termLabelEmpty : styles.termLabel}>{semLabel}</span>
                                {isEmpty && <span className={`${styles.badge} ${styles.badgeOrange}`}>No units</span>}
                                <div className={styles.termDivider} />
                            </div>
              
                            {isEmpty ? (
                                <div className={styles.termEmpty}>
                                    No units assigned this {semLabel.toLowerCase()}.
                                    {editable && onAddUnit && (
                                        <button
                                            className={styles.addUnitBtn}
                                            style={{ marginTop: 8 }}
                                            onClick={() => onAddUnit(year, semester)}
                                        >
                                            + Add Unit
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className={styles.tableWrap}>
                                    <table className={`${styles.table} ${editable && onDeleteUnit ? styles.tableEditable : ''}`}>
                                        <thead>
                                        <tr>
                                            <th>UNIT CODE</th>
                                            <th>UNIT TITLE</th>
                                            <th>TYPE</th>
                                            <th>PREREQUISITE</th>
                                            <th>OFFERED IN</th>
                                            {editable && onDeleteUnit && <th></th>}
                                        </tr>
                                        </thead>
                                        <tbody>
                                            {list.map((unit: PlannerImportUnit, index: number) => (
                                                <tr key={index}>
                                                    <td>
                                                        {editable && onUnitEdit ? (
                                                            <input 
                                                            key={(unit as any)._id}
                                                            type="text" 
                                                            value={unit.unit_code || ''} 
                                                            onChange={(e) => onUnitEdit((unit as any)._id, 'unit_code', e.target.value)}
                                                            className={styles.editInput} 
                                                            />
                                                        ) : (
                                                            <code className={styles.code}>{unit.unit_code}</code>
                                                        )}
                                                        </td>
                                                    <td>
                                                        {editable && onUnitEdit ? (
                                                        <div contentEditable suppressContentEditableWarning className={styles.editTextarea} 
                                                        onBlur={(e) => onUnitEdit((unit as any)._id, 'unit_name', e.currentTarget.textContent || '')}>
                                                            {unit.unit_name || ''}
                                                        </div>
                                                        ) : (
                                                        unit.unit_name || 'Unknown Unit'
                                                        )}
                                                    </td>
                                                    <td>
                                                        {editable && onUnitEdit ? (
                                                        <select value={unit.category || 'elective'} onChange={(e) => onUnitEdit((unit as any)._id, 'category', e.target.value)} className={`${styles.badge} ${styles[badgeClassForCategory(unit.category)]} ${styles.badgeSelect}`}>
                                                            <option value="core">Core</option>
                                                            <option value="major_core">Major Core</option>
                                                            <option value="mpu">MPU</option>
                                                            <option value="wil">WIL</option>
                                                            <option value="prescribed_elective">Prescribed Elective</option>
                                                            <option value="elective">Elective</option>
                                                        </select>
                                                        ) : (
                                                        <span className={`${styles.badge} ${styles[badgeClassForCategory(unit.category)]}`}>{categoryLabel(unit.category)}</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {editable && onUnitEdit ? (
                                                        <input 
                                                            type="text" 
                                                            defaultValue={unit.prerequisite || ''} 
                                                            onBlur={(e) => onUnitEdit((unit as any)._id, 'prerequisite', e.target.value || null)}
                                                            className={styles.editInput} 
                                                            placeholder="-" 
                                                            />
                                                        ) : (
                                                        unit.prerequisite ? <code className={styles.code}>{unit.prerequisite}</code> : <span className={styles.textMuted}>-</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {editable && onUnitEdit ? (
                                                            <select 
                                                            value={unit.offered_in ?? ''} 
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                onUnitEdit((unit as any)._id, 'offered_in', val === '' ? null : Number(val));
                                                            }} 
                                                            className={styles.editInput}
                                                            >
                                                            <option value="">-</option>
                                                            <option value="1">1</option>
                                                            <option value="2">2</option>
                                                            </select>
                                                        ) : (
                                                            unit.offered_in || <span className={styles.textMuted}>-</span>
                                                        )}
                                                    </td>
                                                    {editable && onDeleteUnit && (
                                                        <td>
                                                            <button
                                                                className={styles.deleteBtn}
                                                                onClick={() => onDeleteUnit((unit as any)._id)}
                                                                title="Delete unit"
                                                            >
                                                                DEL
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                            {editable && onAddUnit && (
                                                <tr>
                                                    <td colSpan={editable && onDeleteUnit ? 6 : 5}>
                                                        <button
                                                            className={styles.addUnitBtn}
                                                            onClick={() => onAddUnit(year, semester)}
                                                        >
                                                            + Add Unit
                                                        </button>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                    );
                })}

                {/* Add missing semesters at end of year */}
                {missingSems.filter(s => {
                    const lastExistingOrder = Math.max(...semesters.map(sm => semesterOrder.indexOf(sm.semester)));
                    return semesterOrder.indexOf(s) > lastExistingOrder;
                }).map(ms => (
                    <div key={`missing-end-${ms}`} style={{ marginBottom: 12 }}>
                        <div className={styles.termHeading}>
                            <span className={styles.termLabelEmpty}>{getSemesterLabel(ms)}</span>
                            <span className={`${styles.badge} ${styles.badgeOrange}`}>No units</span>
                            <div className={styles.termDivider} />
                        </div>
                        <div className={styles.termEmpty}>
                            No units assigned this {getSemesterLabel(ms).toLowerCase()}.
                            {editable && onAddUnit && (
                                <button
                                    className={styles.addUnitBtn}
                                    style={{ marginTop: 8 }}
                                    onClick={() => onAddUnit(year, ms)}
                                >
                                    + Add Unit
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {/* Add next year semester 1 */}
                {editable && onAddUnit && yearIndex === yearGroups.length - 1 && (
                    <div style={{ marginTop: 16 }}>
                        <button
                            className={styles.addUnitBtn}
                            onClick={() => onAddUnit(year + 1, 1)}
                        >
                            + Add Year {year + 1} {getSemesterLabel(1)}
                        </button>
                    </div>
                )}
            </div>
            );
        })}
        {/* Recommended Electives (unplaced) */}
        {unplacedElectives.length > 0 && (
            <div className={styles.termGroup}>
                <div className={styles.termHeading}>
                    <span className={styles.termLabel}>Recommended Electives</span>
                    <div className={styles.termDivider} />
                </div>
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>UNIT CODE</th>
                                <th>UNIT TITLE</th>
                                <th>TYPE</th>
                                <th>PREREQUISITE</th>
                                <th>OFFERED IN</th>
                                {editable && onDeleteUnit && <th></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {unplacedElectives.map((unit: PlannerImportUnit, index: number) => (
                                <tr key={`unplaced-${index}`}>
                                    <td>
                                        {editable && onUnitEdit ? (
                                            <input 
                                                key={(unit as any)._id}
                                                type="text" 
                                                value={unit.unit_code || ''} 
                                                onChange={(e) => onUnitEdit((unit as any)._id, 'unit_code', e.target.value)}
                                                className={styles.editInput} 
                                            />
                                        ) : (
                                            <code className={styles.code}>{unit.unit_code}</code>
                                        )}
                                    </td>
                                    <td>
                                        {editable && onUnitEdit ? (
                                            <div contentEditable suppressContentEditableWarning className={styles.editTextarea} 
                                            onBlur={(e) => onUnitEdit((unit as any)._id, 'unit_name', e.currentTarget.textContent || '')}>
                                                {unit.unit_name || ''}
                                            </div>
                                        ) : (
                                            unit.unit_name || 'Unknown Unit'
                                        )}
                                    </td>
                                    <td>
                                        {editable && onUnitEdit ? (
                                            <select value={unit.category || 'elective'} onChange={(e) => onUnitEdit((unit as any)._id, 'category', e.target.value)} className={`${styles.badge} ${styles[badgeClassForCategory(unit.category)]} ${styles.badgeSelect}`}>
                                                <option value="core">Core</option>
                                                <option value="major_core">Major Core</option>
                                                <option value="mpu">MPU</option>
                                                <option value="wil">WIL</option>
                                                <option value="prescribed_elective">Prescribed Elective</option>
                                                <option value="elective">Elective</option>
                                            </select>
                                        ) : (
                                            <span className={`${styles.badge} ${styles[badgeClassForCategory(unit.category)]}`}>{categoryLabel(unit.category)}</span>
                                        )}
                                    </td>
                                    <td>
                                        {editable && onUnitEdit ? (
                                            <input 
                                                type="text" 
                                                defaultValue={unit.prerequisite || ''} 
                                                onBlur={(e) => onUnitEdit((unit as any)._id, 'prerequisite', e.target.value || null)}
                                                className={styles.editInput} 
                                                placeholder="-" 
                                            />
                                        ) : (
                                            unit.prerequisite ? <code className={styles.code}>{unit.prerequisite}</code> : <span className={styles.textMuted}>-</span>
                                        )}
                                    </td>
                                    <td>
                                        {editable && onUnitEdit ? (
                                            <select 
                                                value={unit.offered_in ?? ''} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    onUnitEdit((unit as any)._id, 'offered_in', val === '' ? null : Number(val));
                                                }} 
                                                className={styles.editInput}
                                            >
                                                <option value="">-</option>
                                                <option value="1">1</option>
                                                <option value="2">2</option>
                                            </select>
                                        ) : (
                                            unit.offered_in || <span className={styles.textMuted}>-</span>
                                        )}
                                    </td>
                                    {editable && onDeleteUnit && (
                                        <td>
                                            <button
                                                className={styles.deleteBtn}
                                                onClick={() => onDeleteUnit((unit as any)._id)}
                                                title="Delete unit"
                                            >
                                                DEL
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                                    
                        </tbody>
                    </table>
                </div>
            </div>
        )}
    </>);
}