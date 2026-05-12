'use client';

import { useState, useEffect, useMemo } from 'react';
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
        unit_code: tu.unit?.unit_code || '-',
        unit_name: tu.unit?.unit_name || (tu.category === 'elective' ? 'Elective Slot' : 'Unknown Unit'),
        category: tu.category,
        prerequisite: null,
        requisites: tu.unit?.requisite_groups || null,
        offered_in: tu.unit?.offered_in,
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
        offered_in: egu.unit?.offered_in,
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
                              {planner.major?.name || "General Program"}
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
            />
            <CourseListTable
              yearGroups={yearGroups}
              editable={false}
              unplacedElectives={unplacedElectives}
              emptyMessage="No units attached to this planner template."
            />
          </div>
        ) : (
          <div className={styles.emptyState}>Select a planner from the sidebar to view details.</div>
        )}
      </div>
    </div>
  );
}