import PageTransition from '../../components/PageTransition';
import ToolsAdmin from './ToolsAdmin';

export default function ToolsPage() {
  return (
    <div className="min-h-screen relative pb-20">
      <PageTransition>
        <ToolsAdmin />
      </PageTransition>
    </div>
  );
}