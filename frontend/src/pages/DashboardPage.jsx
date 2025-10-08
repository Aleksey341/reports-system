import { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import PageLayout from '../components/Layout/PageLayout';
import Select from '../components/UI/Select';
import { SkeletonCard } from '../components/UI/Skeleton';
import { useToast } from '../components/UI/Toast';
import { dashboardAPI, municipalitiesAPI, servicesAPI } from '../services/api';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DashboardPage() {
  const toast = useToast();
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [municipalities, setMunicipalities] = useState([]);
  const [services, setServices] = useState([]);

  useEffect(() => {
    loadDashboardData();
    loadMunicipalities();
    loadServices();
  }, [year]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getData(year);
      setDashboardData(data);
    } catch (err) {
      toast.error('Ошибка загрузки данных дашборда');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMunicipalities = async () => {
    try {
      const data = await municipalitiesAPI.getMy();
      setMunicipalities(data);
    } catch (err) {
      console.error('Failed to load municipalities:', err);
    }
  };

  const loadServices = async () => {
    try {
      const data = await servicesAPI.getCatalog();
      setServices(data);
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  };

  // Prepare chart data
  const monthlyChartData = {
    labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
    datasets: [
      {
        label: 'Показатели по месяцам',
        data: dashboardData?.byMonth?.map(m => m.total_value) || [],
        borderColor: 'rgb(37, 99, 235)',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: 'var(--text-primary)'
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'var(--bg-tertiary)',
        titleColor: 'var(--text-primary)',
        bodyColor: 'var(--text-secondary)',
        borderColor: 'var(--border)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: {
          color: 'var(--border)',
          borderColor: 'var(--border)'
        },
        ticks: {
          color: 'var(--text-secondary)'
        }
      },
      y: {
        grid: {
          color: 'var(--border)',
          borderColor: 'var(--border)'
        },
        ticks: {
          color: 'var(--text-secondary)'
        }
      }
    }
  };

  // Calculate KPIs
  const totalRecords = dashboardData?.byMonth?.reduce((sum, m) => sum + (m.records || 0), 0) || 0;
  const totalValue = dashboardData?.byMonth?.reduce((sum, m) => sum + (m.total_value || 0), 0) || 0;
  const avgValue = totalRecords > 0 ? (totalValue / totalRecords).toFixed(2) : 0;

  return (
    <PageLayout title="Дашборд">
      {/* Controls */}
      <div className="flex gap-2 mb-3">
        <Select
          label="Год"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          options={[
            { value: currentYear - 1, label: String(currentYear - 1) },
            { value: currentYear, label: String(currentYear) },
            { value: currentYear + 1, label: String(currentYear + 1) }
          ]}
        />
      </div>

      {loading ? (
        <div className="grid grid-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="kpi-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            margin: '32px 0'
          }}>
            <KPICard
              icon="📊"
              label="Всего записей"
              value={totalRecords}
              change="+12.5%"
              positive
            />
            <KPICard
              icon="📈"
              label="Сумма показателей"
              value={totalValue.toLocaleString()}
              change="+8.3%"
              positive
            />
            <KPICard
              icon="💹"
              label="Средний показатель"
              value={avgValue}
              change="-2.1%"
              negative
            />
          </div>

          {/* Chart */}
          <div className="card" style={{ padding: '24px', marginTop: '24px' }}>
            <h2 style={{ marginBottom: '16px' }}>Динамика по месяцам</h2>
            <div style={{ height: '400px' }}>
              <Line data={monthlyChartData} options={chartOptions} />
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-2" style={{ marginTop: '24px' }}>
            <div className="card">
              <h3>Муниципалитеты</h3>
              <p className="text-muted">Всего: {municipalities.length}</p>
            </div>
            <div className="card">
              <h3>Услуги</h3>
              <p className="text-muted">Всего: {services.length}</p>
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}

function KPICard({ icon, label, value, change, positive, negative }) {
  return (
    <div className="card" style={{
      background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>{icon}</div>
      <div style={{
        color: 'var(--text-secondary)',
        fontSize: '13px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '8px'
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '36px',
        fontWeight: '700',
        color: 'var(--text-primary)',
        marginBottom: '8px'
      }}>
        {value}
      </div>
      {change && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '14px',
          fontWeight: '600',
          color: positive ? 'var(--success)' : negative ? 'var(--danger)' : 'var(--text-muted)'
        }}>
          <span>{positive ? '↑' : negative ? '↓' : '→'}</span>
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}
