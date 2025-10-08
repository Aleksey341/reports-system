export default function Skeleton({ width, height = '20px', variant = 'text', className = '' }) {
  const baseStyle = {
    background: 'linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-loading 1.5s ease-in-out infinite',
    borderRadius: variant === 'circular' ? '50%' : '8px',
    width: width || '100%',
    height: height
  };

  return <div className={`skeleton ${className}`} style={baseStyle}></div>;
}

export function SkeletonText({ lines = 3, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '70%' : '100%'}
          {...props}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card">
      <Skeleton variant="circular" width="60px" height="60px" />
      <div style={{ marginTop: '16px' }}>
        <Skeleton width="60%" height="24px" />
        <div style={{ marginTop: '12px' }}>
          <SkeletonText lines={2} />
        </div>
      </div>
    </div>
  );
}

// Add keyframes to global CSS
const style = document.createElement('style');
style.innerHTML = `
  @keyframes skeleton-loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;
document.head.appendChild(style);
