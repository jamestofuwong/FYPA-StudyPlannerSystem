import styles from '../shared.module.css';
import type { ScrapedStudent } from '../../../../../backend/models/student';
import { groupByTerm, gradeClass, statusClass } from './termFunction';

interface Props {
    courseList: ScrapedStudent['courseList'];
}

export default function StudentCourseList({ courseList }: Props) {
    const termGroups = groupByTerm(courseList);

    return (
        <>
            <div className={styles.sectionTitle}>Course List</div>
 
            {termGroups.map(({ term, list, parsed, isEmpty }) => (
                <div key={term} className={styles.termGroup}>
 
                    {/* Semester heading */}
                    <div className={styles.termHeading}>
                        <span className={isEmpty ? styles.termLabelEmpty : styles.termLabel}>
                            {parsed.label}
                        </span>
                        {isEmpty && (
                            <span className={`${styles.badge} ${styles.badgeOrange}`}>
                                No enrolment
                            </span>
                        )}
                        <div className={styles.termDivider} />
                    </div>
 
                    {/* Empty semester notice */}
                    {isEmpty ? (
                        <div className={styles.termEmpty}>
                            No subjects taken this semester.
                        </div>
                    ) : (
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>UNIT CODE</th>
                                        <th>UNIT TITLE</th>
                                        <th className={styles.tdRight}>CREDITS</th>
                                        <th className={styles.tdRight}>EARNED</th>
                                        <th>GRADE</th>
                                        <th>STATUS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.map(c => (
                                        <tr key={c.courseId}>
                                            <td><code className={styles.code}>{c.courseId}</code></td>
                                            <td>{c.courseTitle}</td>
                                            <td className={styles.tdRight}>{c.credits}</td>
                                            <td
                                                className={styles.tdRight}
                                                style={{ color: c.creditsEarned > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}
                                            >
                                                {c.creditsEarned > 0 ? c.creditsEarned : '—'}
                                            </td>
                                            <td>
                                                {c.grade
                                                    ? <span className={`${styles.badge} ${gradeClass(c.grade)}`}>{c.grade}</span>
                                                    : <span className={styles.textMuted}>—</span>
                                                }
                                            </td>
                                            <td>
                                                <span className={`${styles.badge} ${statusClass(c.status)}`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ))}
        </>
    );
}