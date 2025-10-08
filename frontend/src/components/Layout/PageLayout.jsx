import Header from './Header';
import Footer from './Footer';

export default function PageLayout({ children, title }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header title={title} />
      <main className="container" style={{ flex: 1 }}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
