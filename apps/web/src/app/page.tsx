import { FlowDialog } from '@/components/flow/FlowDialog';
import { FlowProvider } from '@/components/flow/FlowProvider';
import { ResumePill } from '@/components/flow/ResumePill';
import { Landing } from '@/components/landing/Landing';

export default function Home() {
  return (
    <FlowProvider>
      <Landing />
      <FlowDialog />
      <ResumePill />
    </FlowProvider>
  );
}
