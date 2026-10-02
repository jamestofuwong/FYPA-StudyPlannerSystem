'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import CourseListTable, { getSemesterOrder, getSemesterLabel } from '../../../components/planner/CourseListTable';
import PlannerHeader from '../../../components/planner/PlannerHeader';

import styles from './page.module.css'; 

// ==================================================================================================================
// Utility Functions
// ==================================================================================================================
// Convert intake number into Month
function getIntakeLabel(month: number | null): string {
  if (!month) return 'All';
  const months: Record<number, string> = { 1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec' };
  return months[month] || `Month ${month}`;
}

export default function PlannersPage() {
  // ==================================================================================================================
  // STATE HOOKS
  // ==================================================================================================================
  const searchParams = useSearchParams();
  const [planners, setPlanners] = useState<any[]>([]);
  const [selectedPlannerId, setSelectedPlannerId] = useState<string | null>(null);
  const [selectedPlanner, setSelectedPlanner] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showSavedDialog, setShowSavedDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [dirtyUnits, setDirtyUnits] = useState<Record<string, Record<string, unknown>>>({});
  const [dirtyPlanner, setDirtyPlanner] = useState<Record<string, unknown>>({});
  const [editSnapshot, setEditSnapshot] = useState<any | null>(null);

  // ==================================================================================================================
  // useMemo (derived data)
  // ==================================================================================================================
  // Transform units into yearGroups format
  const yearGroups = useMemo(() => {
    if (!selectedPlanner?.units) return [];
    
    const grouped = new Map<number, Map<number, any[]>>();
    
    for (const tu of selectedPlanner.units) {
      const year = tu.year_level || 1;
      const sem = tu.semester || 1;
      
      if (!grouped.has(year)) grouped.set(year, new Map());
      const yearMap = grouped.get(year)!;
      if (!yearMap.has(sem)) yearMap.set(sem, []);
      
      yearMap.get(sem)!.push({
        _id: tu.id,
        unit_code: tu.unit?.unit_code || '-',
        unit_name: tu.unit?.unit_name || (tu.category === 'elective' ? 'Elective Slot' : 'Unknown Unit'),
        category: tu.category,
        prerequisite: formatRequisitesForEdit(tu.unit?.requisite_groups),
        requisites: tu.unit?.requisite_groups || null,
        offered_in: tu.unit?.offerings?.map((o: any) => o.offered_in) ?? [],
        year_level: tu.year_level,
        semester: tu.semester,
      });
    }
    
    const maxYear = Math.max(...grouped.keys(), 1);
    const semesterOrder = getSemesterOrder(selectedPlanner.intake_month || 0);
    
    const result = [];
    for (let year = 1; year <= maxYear; year++) {
      const yearMap = grouped.get(year) || new Map();
      const semesters = semesterOrder.map(sem => {
        const list = yearMap.get(sem) || [];
        return { semester: sem, label: getSemesterLabel(sem), list, isEmpty: list.length === 0 };
      });
      
      result.push({
        year,
        label: `Year ${year}`,
        semesters,
        isEmpty: semesters.every(s => s.isEmpty),
      });
    }
    return result;
  }, [selectedPlanner]);

  const handleUnitEdit = (unitId: string, field: string, value: string | number | number[] | null) => {
    if (!unitId) return;
    setDirtyUnits((previous) => ({
      ...previous,
      [unitId]: { ...previous[unitId], [field]: value },
    }));
    setSelectedPlanner((previous: any) => {
      if (!previous) return previous;
      return {
        ...previous,
        units: (previous.units || []).map((templateUnit: any) => {
          if (templateUnit.id !== unitId) return templateUnit;
          return {
            ...templateUnit,
            ...(field === 'category' ? { category: value } : {}),
            unit: templateUnit.unit ? {
              ...templateUnit.unit,
              ...(field === 'unit_code' ? { unit_code: value } : {}),
              ...(field === 'unit_name' ? { unit_name: value } : {}),
              ...(field === 'offered_in' ? { offerings: (value as number[]).map((offered_in) => ({ offered_in })) } : {}),
            } : templateUnit.unit,
          };
        }),
      };
    });
  };

  const handlePlannerEdit = (field: string, subField?: string, value?: string | number | null) => {
    const requirementFields: Record<string, { count: string; cp: string }> = {
      core: { count: 'core_count', cp: 'core_cp' },
      majorReq: { count: 'major_count', cp: 'major_cp' },
      elective: { count: 'elective_count', cp: 'elective_cp' },
      wil: { count: 'wil_count', cp: 'wil_cp' },
    };
    const monthLabels: Record<string, number> = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };

    let key = field;
    let nextValue: string | number | null = value ?? null;
    if (requirementFields[field] && subField) {
      key = requirementFields[field][subField as 'count' | 'cp'];
    } else if (field === 'course') {
      key = 'course_name';
    } else if (field === 'major') {
      key = 'major_name';
    } else if (field === 'intake') {
      key = 'intake_month';
      nextValue = value ? monthLabels[String(value)] ?? null : null;
    } else if (field === 'intakeYear') {
      key = 'intake_year';
    } else {
      return;
    }

    setDirtyPlanner((previous) => ({ ...previous, [key]: nextValue }));
    setSelectedPlanner((previous: any) => {
      if (!previous) return previous;
      if (key === 'course_name') return { ...previous, course: { ...previous.course, name: nextValue } };
      if (key === 'major_name') return { ...previous, major: { ...previous.major, name: nextValue } };
      return { ...previous, [key]: nextValue };
    });
  };

  const saveUnitEdits = async () => {
    if (!selectedPlannerId || (Object.keys(dirtyUnits).length === 0 && Object.keys(dirtyPlanner).length === 0)) {
      setEditMode(false);
      return;
    }
    setIsSaving(true);
    setSaveMessage('');
    try {
      const requests = Object.entries(dirtyUnits).map(async ([templateUnitId, changes]) => {
        const response = await fetch(`/api/planners/${selectedPlannerId}/template-units`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_unit_id: templateUnitId, ...changes }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'Failed to save planner unit');
        }
      });
      if (Object.keys(dirtyPlanner).length > 0) {
        requests.push((async () => {
          const response = await fetch(`/api/planners/${selectedPlannerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dirtyPlanner),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || 'Failed to save planner details');
          }
        })());
      }
      await Promise.all(requests);
      setDirtyUnits({});
      setDirtyPlanner({});
      setEditSnapshot(null);
      setEditMode(false);
      setSaveMessage('');
      setShowSavedDialog(true);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelPlannerEdit = () => {
    if (editSnapshot) setSelectedPlanner(editSnapshot);
    setDirtyUnits({});
    setDirtyPlanner({});
    setEditSnapshot(null);
    setEditMode(false);
    setSaveMessage('');
  };

  const deleteSelectedPlanner = async () => {
    if (!selectedPlannerId) return;
    setIsDeleting(true);
    setSaveMessage('');

    try {
      const response = await fetch(`/api/planners/${selectedPlannerId}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to delete planner.');
      }

      const remaining = planners.filter((planner) => planner.id !== selectedPlannerId);
      setPlanners(remaining);
      setSelectedPlannerId(remaining[0]?.id || null);
      setSelectedPlanner(null);
      setDirtyUnits({});
      setDirtyPlanner({});
      setEditSnapshot(null);
      setEditMode(false);
      setShowDeleteDialog(false);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Failed to delete planner.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Extract the elective groups
  const unplacedElectives = useMemo(() => {
    if (!selectedPlanner?.elective_groups) return [];
    return selectedPlanner.elective_groups.flatMap((eg: any) =>
      (eg.units || []).map((egu: any) => ({
        unit_code: egu.unit?.unit_code || '',
        unit_name: egu.unit?.unit_name || '',
        category: 'elective',
        prerequisite: null,
        requisites: egu.unit?.requisite_groups || null,
        offered_in: egu.unit?.offerings?.map((o: any) => o.offered_in) ?? [],
        year_level: null,
        semester: null,
      }))
    );
  }, [selectedPlanner]);

  // Group planners by course → year
  const groupedPlanners = useMemo(() => {
    const grouped: Record<string, Record<number, any[]>> = {};
    for (const p of planners) {
      const course = p.course?.name || 'Unknown';
      const year = p.intake_year;
      if (!grouped[course]) grouped[course] = {};
      if (!grouped[course][year]) grouped[course][year] = [];
      grouped[course][year].push(p);
    }
    return grouped;
  }, [planners]);

  // Get sorted courses
  const courses = useMemo(() => 
    Object.keys(groupedPlanners).sort(),
  [groupedPlanners]);

  const minorUnits = useMemo(() => {
    if (!selectedPlanner?.minors) return [];
    return selectedPlanner.minors.flatMap((minor: any) =>
      (minor.units || []).map((mu: any) => ({
        unit_code: mu.unit?.unit_code || '',
        unit_name: mu.unit?.unit_name || '',
        category: 'elective',
        prerequisite: null,
        requisites: mu.unit?.requisite_groups || null,
        offered_in: mu.unit?.offerings?.map((o: any) => o.offered_in) ?? [],
        year_level: null,
        semester: null,
        minor_name: minor.name,
      }))
    );
  }, [selectedPlanner]);

  // ==================================================================================================================
  // EVENT HANDLERS & HELPER FUNCTIONS
  // ==================================================================================================================
  // Get sorted years for a course
  const getSortedYears = (course: string) => 
    Object.keys(groupedPlanners[course])
      .map(Number)
      .sort((a, b) => b - a); // newest first

  // Toggle course expansion/collapse
  const toggleCourse = (course: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      next.has(course) ? next.delete(course) : next.add(course);
      return next;
    });
  };

  // Toggle year expansion/collapse within a course
  const toggleYear = (course: string, year: number) => {
    const key = `${course}-${year}`;
    setExpandedYears(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ==================================================================================================================
  // useEffect HOOKS
  // ==================================================================================================================
  // Initial data load - Get all planner tmplates
  useEffect(() => {
    const fetchPlanners = async () => {
      try {
        const response = await fetch('/api/planners', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setPlanners(data);
          if (data.length > 0) {
            const requestedPlannerId = searchParams.get('plannerId');
            setSelectedPlannerId(requestedPlannerId || data[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch planners:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlanners();
  }, [searchParams]);

  // Load selected planner details
  useEffect(() => {
    const fetchPlannerDetails = async () => {
      setEditMode(false);
      setDirtyUnits({});
      setDirtyPlanner({});
      setEditSnapshot(null);
      setSaveMessage('');
      if (!selectedPlannerId) {
        setSelectedPlanner(null);
        return;
      }

      // Find the basic planner info from the list
      const basicPlanner = planners.find(p => p.id === selectedPlannerId);
      
      try {
        const response = await fetch(`/api/planners/${selectedPlannerId}`);
        if (response.ok) {
          const fullDetailData = await response.json();

          // Merge basic info with full details
          setSelectedPlanner({
            ...basicPlanner,
            ...fullDetailData,
          });
        } else {
          // If fetch fails, at least show basic info
          setSelectedPlanner(basicPlanner || null);
        }
      } catch (error) {
        console.error("Failed to fetch full planner details:", error);
        // If fetch fails, at least show basic info
        setSelectedPlanner(basicPlanner || null);
      }
    };

    fetchPlannerDetails();
  }, [selectedPlannerId, planners]);

  // Auto-expand groups when searching
  useEffect(() => {
    if (!searchQuery) return;
    const q = searchQuery.toLowerCase();
    const newExpandedCourses = new Set<string>();
    const newExpandedYears = new Set<string>();
    
    for (const p of planners) {
      const matches = p.major?.name?.toLowerCase().includes(q) ||
        p.course?.name?.toLowerCase().includes(q) ||
        p.course?.code?.toLowerCase().includes(q);
      
      if (matches) {
        const course = p.course?.name || p.course?.code || 'Unknown';
        newExpandedCourses.add(course);
        newExpandedYears.add(`${course}-${p.intake_year}`);
      }
    }
    
    setExpandedCourses(newExpandedCourses);
    setExpandedYears(newExpandedYears);
  }, [searchQuery, planners]);
  
  // ==================================================================================================================
  // RETURN (JSX)
  // ==================================================================================================================
  return (
    <div className={styles.layout}>

      {/* LEFT PANEL: The List of Planners */}
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <input
            type="text"
            placeholder="🔍 Filter planners..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Link href="/import">
            <button className={styles.btnPrimary}>
              + Import
            </button>
          </Link>
        </div>

        <div className={styles.listItems}>
          {isLoading ? (
            <div className={styles.emptyState}>Loading...</div>
          ) : planners.length === 0 ? (
            <div className={styles.emptyState}>No planners found.</div>
          ) : (
            courses.map(course => (
              <div key={course}>
                {/* Course Header */}
                <div
                  className={styles.courseGroup}
                  onClick={() => toggleCourse(course)}
                >
                  <span className={styles.courseArrow}>
                    {expandedCourses.has(course) ? '▼' : '▶'}
                  </span>
                  <span className={styles.courseName}>{course}</span>
                  <span className={styles.courseCount}>
                    {Object.values(groupedPlanners[course]).flat().length}
                  </span>
                </div>

                {/* Years under course */}
                {expandedCourses.has(course) && getSortedYears(course).map(year => {
                  const yearPlanners = groupedPlanners[course][year];
                  const yearKey = `${course}-${year}`;
                  return (
                    <div key={yearKey}>
                      {/* Year Header */}
                      <div
                        className={styles.yearGroup}
                        onClick={() => toggleYear(course, year)}
                      >
                        <span className={styles.yearArrow}>
                          {expandedYears.has(yearKey) ? '▼' : '▶'}
                        </span>
                        <span className={styles.yearLabel}>{year}</span>
                        <span className={styles.yearCount}>{yearPlanners.length}</span>
                      </div>

                      {/* Planner items under year */}
                      {expandedYears.has(yearKey) && yearPlanners
                        .filter(p => {
                          if (!searchQuery) return true;
                          const q = searchQuery.toLowerCase();
                          return p.major?.name?.toLowerCase().includes(q) ||
                            p.course?.name?.toLowerCase().includes(q);
                        })
                        .map((planner: any) => (
                          <div
                            key={planner.id}
                            onClick={() => setSelectedPlannerId(planner.id)}
                            className={`${styles.listItem} ${selectedPlannerId === planner.id ? styles.listItemActive : ''}`}
                          >
                            <div className={styles.majorName}>
                              {planner.major?.name || planner.course?.name || "General Program"}
                            </div>
                            <div className={styles.itemMeta}>
                              {getIntakeLabel(planner.intake_month)} · {planner._count?.units || 0} units
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL: The Selected Planner Details */}
      <div className={styles.detailPanel}>
        {selectedPlanner ? (
          <div>
            <div className={styles.editActions}>
              {!editMode ? (
                <button className={styles.btnPrimary} onClick={() => { setEditSnapshot(JSON.parse(JSON.stringify(selectedPlanner))); setEditMode(true); setSaveMessage(''); setShowSavedDialog(false); }}>
                  Edit Planner
                </button>
              ) : (
                <>
                  <button className={styles.btnPrimary} onClick={saveUnitEdits} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button className={styles.btnPrimary} onClick={cancelPlannerEdit} disabled={isSaving}>
                    Cancel
                  </button>
                </>
              )}
              <button className={styles.btnDanger} onClick={() => { setShowDeleteDialog(true); setSaveMessage(''); }} disabled={isDeleting || isSaving}>
                Delete Planner
              </button>
              {saveMessage && <span>{saveMessage}</span>}
            </div>
            <PlannerHeader
              course={selectedPlanner.course?.name || ''}
              major={selectedPlanner.major?.name || ''}
              intake={getIntakeLabel(selectedPlanner.intake_month)}
              intakeYear={selectedPlanner.intake_year || ''}
              requirements={{
                core: { count: selectedPlanner.core_count, cp: selectedPlanner.core_cp },
                majorReq: { count: selectedPlanner.major_count, cp: selectedPlanner.major_cp },
                elective: { count: selectedPlanner.elective_count, cp: selectedPlanner.elective_cp },
                wil: { count: selectedPlanner.wil_count, cp: selectedPlanner.wil_cp },
              }}
              editable={editMode}
              onEdit={handlePlannerEdit}
            />
            <CourseListTable
              yearGroups={yearGroups}
              editable={editMode}
              onUnitEdit={handleUnitEdit}
              unplacedElectives={unplacedElectives}
              minorUnits={minorUnits}
              emptyMessage="No units attached to this planner template."
            />
          </div>
        ) : (
          <div className={styles.emptyState}>Select a planner from the sidebar to view details.</div>
        )}
      </div>
      {showSavedDialog && (
        <div className={styles.dialogOverlay} role="presentation">
          <div className={styles.savedDialog} role="dialog" aria-modal="true" aria-labelledby="planner-save-title">
            <h2 id="planner-save-title">Changes saved</h2>
            <p>Your planner changes have been saved successfully.</p>
            <button className={styles.btnPrimary} onClick={() => setShowSavedDialog(false)} autoFocus>
              OK
            </button>
          </div>
        </div>
      )}
      {showDeleteDialog && (
        <div
          className={styles.dialogOverlay}
          role="presentation"
          onClick={() => { if (!isDeleting) setShowDeleteDialog(false); }}
        >
          <div
            className={styles.savedDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="planner-delete-title">Delete planner?</h2>
            <p>This will permanently remove the selected planner and its planner-specific unit placements.</p>
            <div className={styles.dialogActions}>
              <button className={styles.btnSecondary} onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
                Cancel
              </button>
              <button className={styles.btnDanger} onClick={deleteSelectedPlanner} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  
}

function formatRequisitesForEdit(groups: any): string {
  if (!Array.isArray(groups)) return '';
  return groups
    .map((group: any) => (group.conditions || []).map((condition: any) => {
      if (condition.type === 'credit_points') return `${condition.credit_points}cp`;
      const prefix = condition.requisite_type === 'corequisite'
        ? 'Co: '
        : condition.requisite_type === 'antirequisite'
          ? 'Anti: '
          : '';
      return `${prefix}${condition.unit?.unit_code || ''}`;
    }).filter(Boolean).join(' & '))
    .filter(Boolean)
    .join(' / ');
}
