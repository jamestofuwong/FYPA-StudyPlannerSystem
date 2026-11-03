-- Records the free-elective share of a saved unit figure, so an export can split seats into
-- "Needed to graduate" and "Optional" like the page does.
--
-- Written by hand for the same reason as 20261008120000_add_estimation_run_course. Nullable: runs saved
-- before this have no split recorded.

-- AlterTable
ALTER TABLE "estimation_run_units" ADD COLUMN "from_free_electives" DECIMAL(10,4);
