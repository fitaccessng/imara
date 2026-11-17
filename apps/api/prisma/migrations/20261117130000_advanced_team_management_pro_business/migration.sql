-- Manager-role and advanced team-management features are available on both
-- paid plans. Update only the feature flag: keep configured prices and limits.
UPDATE "PlanCatalogue"
SET "advancedTeamManagement" = TRUE,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "plan" IN ('PRO', 'BUSINESS');
