import { Header } from '@/app/shell';
import GuestJoin from './join';

export default function JoinPage() {
  return <><Header guest /><main className="entry"><GuestJoin /></main></>;
}
