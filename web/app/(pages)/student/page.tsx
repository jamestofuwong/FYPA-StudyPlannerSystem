'use client';

import { useState } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import { getMockStudent } from '../../../../core/services/studentService';
import type { ScrapedStudent } from '../../../../core/shared/types/student';
import StudentDetails from './studentDetails';
import StudentCourseList from './studentCourseList';

export default function StudentPage() {
  const { showToast } = useToast();
  const [inputId, setInputId] = useState('');
  const [student, setStudent] = useState<ScrapedStudent | null>(null);

  function handleFetch() {
    const id = inputId.trim();
    if (!id) {
      showToast('Please enter a Student ID.', 'error');
      return;
    }
    const data = getMockStudent();
    setStudent(data);
    showToast('Student loaded.', 'success');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleFetch();
  }

  function handleClear() {
    setStudent(null);
    setInputId('');
  }

  return (
    <div className={styles.panel}>
      <div className={styles.sectionTitle}>Student Lookup</div>
      <div className={styles.card}>
        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
          <label className={styles.formLabel}>Student ID</label>
          <div className={styles.inputRow}>
            <input
              className={`${styles.formInput} ${styles.formInputMono}`}
              type="text"
              placeholder="Enter student ID and press Enter…"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className={styles.btnPrimary} onClick={handleFetch}>
              Fetch
            </button>
            <button className={styles.btnSecondary} onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>
      </div>

      {!student && (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>No student loaded</div>
          <div className={styles.emptyStateSub}>Enter a Student ID above to view their details.</div>
        </div>
      )}

      {student && (
        <>
          <StudentDetails student={student} />
          <StudentCourseList courseList={student.courseList} />
        </>
      )}
    </div>
  );
}
