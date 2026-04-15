'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css'; // Import your new CSS module!

export default function PlannersPage() {
  const [planners, setPlanners] = useState<any[]>([]);
  const [selectedPlanner, setSelectedPlanner] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchPlanners = async () => {
      try {
        const response = await fetch('/api/planners');
        if (response.ok) {
          const data = await response.json();
          console.log("DEBUG DATA:", data);
          setPlanners(data);
          if (data.length > 0) {
            setSelectedPlanner(data[0]);
          }
        }
      } catch (error) {
        console.error("Failed to fetch planners:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlanners();
  }, []);

    useEffect(() => {
        const fetchSelectedDetails = async () => {
          // Don't fetch if no ID, or if we already have the units loaded
          if (!selectedPlanner?.id || selectedPlanner.units) return;

          try {
            const response = await fetch(`/api/planners/${selectedPlanner.id}`);
            if (response.ok) {
              const fullDetailData = await response.json();
              setSelectedPlanner(fullDetailData);
            }
          } catch (error) {
            console.error("Failed to fetch full planner details:", error);
          }
        };
        fetchSelectedDetails();
      }, [selectedPlanner?.id]);

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
            <div style={{ padding: '16px', color: '#888' }}>Loading database...</div>
          ) : planners.length === 0 ? (
            <div style={{ padding: '16px', color: '#888' }}>No planners found in database.</div>
          ) : (
            planners
              .filter((planner) =>
                planner.major?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                planner.course?.code?.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((planner) => (
              <div
                key={planner.id}
                onClick={() => setSelectedPlanner(planner)}
                className={`${styles.listItem} ${selectedPlanner?.id === planner.id ? styles.listItemActive : ''}`}
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
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>
                {selectedPlanner.major?.name || selectedPlanner.course?.name}
              </h2>
              <div className={styles.detailMeta}>
                Course: {selectedPlanner.course?.code} · Intake Year: {selectedPlanner.intake_year} · Total Units: {selectedPlanner._count?.units || selectedPlanner.units?.length || 0}
              </div>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Unit Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Year / Sem</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPlanner.units?.map((unitItem: any, index: number) => (
                    <tr key={index}>
                      <td className={styles.unitCode}>
                        {unitItem.unit?.unit_code || "N/A"}
                      </td>
                      <td className={styles.unitName}>
                        {unitItem.unit?.unit_name || "Unknown Unit"}
                      </td>
                      <td>
                        <span className={styles.categoryBadge}>
                          {unitItem.category?.replace('_', ' ') || 'core'}
                        </span>
                      </td>
                      <td style={{ color: '#9CDCFE' }}>
                        Y{unitItem.year_level} S{unitItem.semester}
                      </td>
                    </tr>
                  ))}
                  {(!selectedPlanner.units && selectedPlanner._count?.units > 0) ? (
                    <tr>
                      <td colSpan={4} className={styles.emptyState}>Loading units...</td>
                    </tr>
                  ) : (!selectedPlanner.units || selectedPlanner.units.length === 0) && (
                    <tr>
                      <td colSpan={4} className={styles.emptyState}>No units attached to this planner template.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            Select a planner from the sidebar to view details.
          </div>
        )}
      </div>

    </div>
  );
}