import styles from './Planner.module.css';
import { useMemo } from 'react';
import type { PlannerImportUnit } from '@core/shared/types/plannerImport';


// ==================================================================================================================
// Types
// ==================================================================================================================
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
    onAddUnit?: (year: number, semester: number, type?: 'core' | 'elective' | 'minor', minorName?: string) => void;
    onDeleteUnit?: (unitCode: string) => void;
    onAddSemester?: (year: number, semester: number, label: string) => void;
    intakeMonth?: number;
    unplacedElectives?: PlannerImportUnit[];
    minorUnits?: PlannerImportUnit[];
};


// ==================================================================================================================
// Utility Functions
// ==================================================================================================================
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

// Converts DB data into string
function formatRequisites(requisites: any): string {
    // If null return '-'
    if (!requisites || (Array.isArray(requisites) && requisites.length === 0)) return '-';
    
    // If it's a string (import page fallback), return it
    if (typeof requisites === 'string') return requisites;
    // Map Groups (OR)
    return requisites.map((g: any) => 
        // Map Conditions (AND)
        g.conditions.map((c: any) => {
            // Format credit points
            if (c.type === 'credit_points') return `${c.credit_points}cp`;
            // Add prefix if co/anti, else just the unit code
            const prefix = c.requisite_type === 'corequisite' ? 'Co: ' :
                            c.requisite_type === 'antirequisite' ? 'Anti: ' : '';
            return `${prefix}${c.unit?.unit_code || '?'}`;
        }).join(' & ')
    ).join(' / ');
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


// ==================================================================================================================
// Component
// ==================================================================================================================
export default function CourseListTable({ 
    yearGroups, 
    emptyMessage = 'No units found.',
    editable = false,
    onUnitEdit,
    onAddUnit,
    onDeleteUnit,
    onAddSemester,
    intakeMonth = 0,
    unplacedElectives = [],
    minorUnits = []
}: CourseListTableProps) {


    // ==================================================================================================================
    // Derived Data
    // ==================================================================================================================
    const totalUnits = yearGroups.reduce((count, year) => {
        return count + year.semesters.reduce((sum, sem) => sum + sem.list.length, 0);
    }, 0);

    if (totalUnits === 0) {
        return <div className={styles.termEmpty}>{emptyMessage}</div>;
    }

    const semesterOrder = getSemesterOrder(intakeMonth);

    // Group the minor unit by minor_name
    const groupedMinors = useMemo(() => {
        if (!minorUnits.length) return {};
        return minorUnits.reduce((acc, unit) => {
            const name = unit.minor_name || 'Minor';
            if (!acc[name]) acc[name] = [];
            acc[name].push(unit);
            return acc;
        }, {} as Record<string, PlannerImportUnit[]>);
    }, [minorUnits]);


    // ==================================================================================================================
    // RETURN (JSX)
    // ==================================================================================================================
    return (<>
        <div className={styles.sectionTitle}>Course List</div>
        
        {/* ============================================================================================================== */}
        {/* Section 1: Year & Semester Tables */}
        {/* ============================================================================================================== */}
        {yearGroups.map(({ year, label, semesters, isEmpty: yearEmpty }, yearIndex) => {
            const existingSems = new Set(semesters.map(s => s.semester));
            const missingSems = semesterOrder.filter(s => !existingSems.has(s));
            
            return (
            <div key={year} className={styles.termGroup}>

                {/* Year Header */}
                <div className={styles.termHeading}>
                    <span className={yearEmpty ? styles.termLabelEmpty : styles.termLabel}>{label}</span>
                    {yearEmpty && <span className={`${styles.badge} ${styles.badgeOrange}`}>No units</span>}
                    <div className={styles.termDivider} />
                </div>
                
                {/* Semester Tables */}
                {semesters.map(({ semester, label: semLabel, list, isEmpty }, semIndex) => {
                    // Find missing semesters that should appear BEFORE this one
                    const currentOrderIndex = semesterOrder.indexOf(semester);
                    const missingBefore = missingSems.filter(s => semesterOrder.indexOf(s) < currentOrderIndex);
                    
                    // Skip empty semesters when not editable
                    if (!editable && isEmpty) return null;

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
                                        
                                        {/* Table Headers */}
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

                                            {/* Unit Rows */}
                                            {list.map((unit: PlannerImportUnit, index: number) => (
                                                <tr key={index}>

                                                    {/* Unit Code */}
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
                                                            unit.unit_code !== '-' ? (
                                                                <code className={styles.code}>{unit.unit_code}</code>
                                                            ) : (
                                                                <span className={styles.textMuted}>-</span>
                                                            )
                                                        )}
                                                    </td>

                                                    {/* Unit Name */}
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

                                                    {/* Category */}
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

                                                    {/* Prerequisite */}
                                                    <td>
                                                        {editable && onUnitEdit ? (
                                                        <div contentEditable suppressContentEditableWarning className={styles.editTextarea} 
                                                        onBlur={(e) => onUnitEdit((unit as any)._id, 'prerequisite', e.currentTarget.textContent || '')}>
                                                            {unit.prerequisite || ''}
                                                        </div>
                                                        ) : (
                                                            formatRequisites(unit.requisites || unit.prerequisite)
                                                        )}
                                                    </td>

                                                    {/* Offered In */}
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

                                                    {/* Delete Action */}
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

                                            {/* Add Unit Button */}
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

                {/* Missing Semesters (at end of year) */}
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

               {/* Add Next Year Button */}
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


        {/* ============================================================================================================== */}
        {/* Section 2: Recommended Electives */}
        {/* ============================================================================================================== */}
        {(unplacedElectives.length > 0 || (editable && onAddUnit)) && (
            <div className={styles.termGroup}>

                {/* Section Header */}
                <div className={styles.termHeading}>
                    <span className={unplacedElectives.length === 0 ? styles.termLabelEmpty : styles.termLabel}>Recommended Electives</span>
                    {unplacedElectives.length === 0 && <span className={`${styles.badge} ${styles.badgeOrange}`}>No units</span>}
                    <div className={styles.termDivider} />
                </div>

                {unplacedElectives.length === 0 ? (
                    <div className={styles.termEmpty}>
                        No units assigned in recommended elective table.
                        {editable && onAddUnit && (
                            <button
                                className={styles.addUnitBtn}
                                style={{ marginTop: 8 }}
                                onClick={() => onAddUnit(0, 0, 'elective')}
                            >
                                + Add Elective Unit
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={`${styles.table} ${editable && onDeleteUnit ? styles.tableEditable : ''}`}>
                            
                            {/* Table Headers */}
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

                                {/* Unit Rows */}
                                {unplacedElectives.map((unit: PlannerImportUnit, index: number) => (
                                    <tr key={`unplaced-${index}`}>

                                        {/* Unit Code */}
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

                                        {/* Unit Name */}
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

                                        {/* Category */}
                                        <td><span className={`${styles.badge} ${styles.badgeGreen}`}>Elective</span></td>
                                        
                                        {/* Prerequisite */}
                                        <td>
                                            {editable && onUnitEdit ? (
                                                <div contentEditable suppressContentEditableWarning className={styles.editTextarea} 
                                                    onBlur={(e) => onUnitEdit((unit as any)._id, 'prerequisite', e.currentTarget.textContent || '')}>
                                                    {unit.prerequisite || ''}
                                                </div>
                                            ) : (
                                                formatRequisites(unit.requisites || unit.prerequisite)
                                            )}
                                        </td>

                                        {/* Offered In */}
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

                                        {/* Delete Action */}
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

                                {/* Add Unit Button */}
                                {editable && onAddUnit && (
                                    <tr>
                                        <td colSpan={editable && onDeleteUnit ? 6 : 5}>
                                            <button className={styles.addUnitBtn} onClick={() => onAddUnit(0, 0, 'elective')}>
                                                + Add Elective Unit
                                            </button>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}


        {/* ============================================================================================================== */}
        {/* Section 3: Minors */}
        {/* ============================================================================================================== */}
        {Object.entries(groupedMinors).map(([name, units]) => (
            <div key={name} className={styles.termGroup}>

                {/* Minor Header (Editable) */}
                <div className={styles.termHeading}>
                    <div contentEditable={editable} suppressContentEditableWarning className={styles.minorLabel}
                        onBlur={(e) => {
                            const newName = e.currentTarget.textContent || '';
                            units.forEach((unit: any) => {
                                onUnitEdit?.(unit._id, 'minor_name', newName);
                            });
                        }}
                    >
                        {name}
                    </div>
                    <div className={styles.termDivider} />
                </div>

                {/* Minor Units Table */}
                <div className={styles.tableWrap}>
                    <table className={`${styles.table} ${editable && onDeleteUnit ? styles.tableEditable : ''}`}>
                        
                        {/* Table Headers */}
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

                            {/* Unit Rows */}
                            {units.map((unit: PlannerImportUnit, index: number) => (
                                <tr key={`minor-${name}-${index}`}>

                                    {/* Unit Code */}
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

                                    {/* Unit Name */}
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

                                    {/* Category */}
                                    <td><span className={`${styles.badge} ${styles.badgeGreen}`}>Elective</span></td>
                                        
                                    {/* Prerequisite */}
                                    <td>
                                        {editable && onUnitEdit ? (
                                           <div contentEditable suppressContentEditableWarning className={styles.editTextarea} 
                                                onBlur={(e) => onUnitEdit((unit as any)._id, 'prerequisite', e.currentTarget.textContent || '')}>
                                                {unit.prerequisite || ''}
                                            </div>
                                        ) : (
                                            formatRequisites(unit.requisites || unit.prerequisite)
                                        )}
                                    </td>

                                    {/* Offered In */}
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

                                    {/* Delete Action */}
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

                            {/* Add Minor Unit Button */}
                            {editable && onAddUnit && (
                                <tr>
                                    <td colSpan={editable && onDeleteUnit ? 6 : 5}>
                                        <button className={styles.addUnitBtn} onClick={() => onAddUnit(0, 0, 'minor', name)}>
                                            + Add Minor Unit
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        ))}

        {/* Add New Minor Button */}
        {editable && onAddUnit && (
            <div className={styles.termGroup}>
                <button 
                    className={styles.addUnitBtn}
                    onClick={() => onAddUnit(0, 0, 'minor', 'Enter New Minor Name')}
                >
                    + Add New Minor
                </button>
            </div>
        )}
    </>);
}