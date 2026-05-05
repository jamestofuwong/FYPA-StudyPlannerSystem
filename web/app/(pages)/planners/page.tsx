'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import CourseListTable, { getSemesterOrder, getSemesterLabel } from '../../../components/planner/CourseListTable';
import PlannerHeader from '../../../components/planner/PlannerHeader';

import styles from './page.module.css'; 

export default function PlannersPage() {
  const searchParams = useSearchParams();
  const [planners, setPlanners] = useState<any[]>([]);
  const [selectedPlannerId, setSelectedPlannerId] = useState<string | null>(null);
  const [selectedPlanner, setSelectedPlanner] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");


  // Convert intake number into Month
  function getIntakeLabel(month: number | null): string {
    if (!month) return 'All';
    const months: Record<number, string> = { 1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec' };
    return months[month] || `Month ${month}`;
  }

  useEffect(() => {
    const fetchPlanners = async () => {
      try {
        const response = await fetch('/api/planners', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          console.log("DEBUG DATA:", data);
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

  // Transform units into yearGroups format
  const yearGroups = useMemo(() => {
    if (!selectedPlanner?.units) return [];
    
    const grouped = new Map<number, Map<number, any[]>>();
    
    for (const tu of selectedPlanner.units) {
      if (!tu.unit) continue;
      const year = tu.year_level || 1;
      const sem = tu.semester || 1;
      
      if (!grouped.has(year)) grouped.set(year, new Map());
      const yearMap = grouped.get(year)!;
      if (!yearMap.has(sem)) yearMap.set(sem, []);
      
      yearMap.get(sem)!.push({
        unit_code: tu.unit.unit_code,
        unit_name: tu.unit.unit_name,
        category: tu.category,
        prerequisite: null,
        offered_in: tu.unit.offered_in,
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
        offered_in: egu.unit?.offered_in,
        year_level: null,
        semester: null,
      }))
    );
  }, [selectedPlanner]);

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
            <div className={styles.emptyState} style={{ padding: '16px' }}>Loading database...</div>
          ) : planners.length === 0 ? (
            <div className={styles.emptyState} style={{ padding: '16px' }}>No planners found in database.</div>
          ) : (
            planners
              .filter((planner) =>
                planner.major?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                planner.course?.code?.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((planner) => (
              <div
                key={planner.id}
                onClick={() => setSelectedPlannerId(planner.id)}
                className={`${styles.listItem} ${selectedPlannerId === planner.id ? styles.listItemActive : ''}`}
              >
                <div className={styles.majorName}>
                  {planner.major?.name || "General Program"}
                </div>
                <div className={styles.itemMeta}>
                  {planner.course?.code} · Intake {planner.intake_year} · {planner._count?.units || 0} units
                </div>
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