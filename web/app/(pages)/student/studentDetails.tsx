import styles from './page.module.css';
import type { ScrapedStudent } from '../../../../core/shared/types/student';

interface Props {
  student: ScrapedStudent;
}

export default function StudentDetails({ student }: Props) {
  return (
    <>
      <div className={styles.sectionTitle}>Student Details</div>
      <div className={styles.card}>
        <div className={styles.formGrid2}>
          <div>
            <div className={styles.formLabel}>Student Name</div>
            <div className={styles.fieldValue}>{student.studentName ?? <span className={styles.fieldValueMuted}>—</span>}</div>
          </div>
          <div>
            <div className={styles.formLabel}>Programme</div>
            <div className={styles.fieldValue}>{student.course}</div>
          </div>
          <div>
            <div className={styles.formLabel}>Status</div>
            <span className={`${styles.badge} ${student.status === 'Active' ? styles.badgeGreen : styles.badgeRed}`}>{student.status}</span>
          </div>
          <div>
            <div className={styles.formLabel}>Grade Level</div>
            <div className={styles.fieldValueMono}>{student.gradeLevel}</div>
          </div>
          <div>
            <div className={styles.formLabel}>Enrolment Date</div>
            <div className={styles.fieldValueMono}>{student.enrollmentDate}</div>
          </div>
          <div className={styles.gridColFull}>
            <div className={styles.formLabel}>Areas of Studies</div>
            <div className={styles.fieldValueMono}>
              {student.areasOfStudy && student.areasOfStudy.length > 0 ? student.areasOfStudy.join(', ') : <span className={styles.fieldValueMuted}>—</span>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
