import DoughnutChart from "@/components/charts/DoughnutChart";
import { en } from "@/content/en";
import { useAdminCategoriesUsage, useAdminOverview } from "@/features/admin/hooks";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="panel admin-stat-card">
      <p className="admin-stat-card__label">{label}</p>
      <p className="admin-stat-card__value">{value}</p>
    </article>
  );
}

export default function AdminDashboardPage() {
  const overview = useAdminOverview();
  const categoryUsage = useAdminCategoriesUsage();

  if (overview.isLoading || categoryUsage.isLoading) {
    return <p>{en.common.loadingLabel}</p>;
  }

  const stats = overview.data;
  const usage = categoryUsage.data;

  if (!stats || !usage) {
    return <p>{en.common.genericErrorDetail}</p>;
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>{en.admin.dashboard.title}</h1>
        <p>{en.admin.dashboard.subtitle}</p>
      </header>

      <div className="admin-stat-grid">
        <StatCard label={en.admin.dashboard.cards.totalUsers} value={String(stats.totalUsers)} />
        <StatCard
          label={en.admin.dashboard.cards.activeStudents}
          value={String(stats.activeStudents)}
        />
        <StatCard
          label={en.admin.dashboard.cards.totalTransactions}
          value={String(stats.totalTransactions)}
        />
        <StatCard
          label={en.admin.dashboard.cards.aiAcceptanceRate}
          value={`${stats.aiAcceptanceRate.toFixed(2)}%`}
        />
        <StatCard
          label={en.admin.dashboard.cards.dailyActiveUsers}
          value={stats.dau === null ? en.admin.dashboard.insufficientData : String(stats.dau)}
        />
        <StatCard
          label={en.admin.dashboard.cards.monthlyActiveUsers}
          value={stats.mau === null ? en.admin.dashboard.insufficientData : String(stats.mau)}
        />
      </div>

      <DoughnutChart
        title={en.admin.dashboard.categoriesChartTitle}
        subtitle={en.admin.dashboard.categoriesChartSubtitle}
        caption={en.admin.dashboard.categoriesChartCaption}
        data={usage.data.map((item) => ({
          label: `${item.name} (${item.distinctUserCount})`,
          value: String(item.usageCount),
        }))}
      />
    </section>
  );
}
