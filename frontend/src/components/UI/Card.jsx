export default function Card({ children, className = '', onClick, hover = false, ...props }) {
  return (
    <div
      className={`card ${hover ? 'card-hover' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardIcon({ children }) {
  return (
    <div className="card-icon">
      {children}
    </div>
  );
}

export function CardTitle({ children }) {
  return (
    <h3 className="card-title">{children}</h3>
  );
}

export function CardDescription({ children }) {
  return (
    <p className="card-description">{children}</p>
  );
}

export function CardLink({ children, href }) {
  return (
    <a href={href} className="card-link">
      {children}
    </a>
  );
}
