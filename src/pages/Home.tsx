import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Play, User } from 'lucide-react';
import Layout from '../components/Layout';
import { Badge, Button, Card, GameLogo, InputField } from '../components/UI';
import { createRoom } from '../firebase/roomService';

export default function Home() {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const cleanName = name.trim();
  const cleanRoomId = roomId.trim().toUpperCase();

  const handleCreate = async () => {
    if (!cleanName) return;
    setLoading(true);
    try {
      const { roomId: id, playerId } = await createRoom(cleanName);
      localStorage.setItem('handcrik_name', cleanName);
      localStorage.setItem(`handcrik_player_${id}`, playerId);
      navigate(`/room/${id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = () => {
    if (!cleanName || !cleanRoomId) return;
    localStorage.setItem('handcrik_name', cleanName);
    navigate(`/room/${cleanRoomId}`);
  };

  return (
    <Layout className="items-center">
      <GameLogo />

      <Card className="panel-shell overflow-hidden rounded-lg p-5 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-[-0.04em] text-copy-primary">Match entry</h2>
            <p className="mt-1 text-sm font-medium text-copy-secondary">Create a room or join with a code.</p>
          </div>
          <Badge tone="green">Live</Badge>
        </div>

        <div className="space-y-5">
          <InputField
            label="Player name"
            icon={User}
            placeholder="Enter your name"
            value={name}
            maxLength={24}
            onChange={(event) => setName(event.target.value)}
          />

          <Button
            onClick={handleCreate}
            loading={loading}
            disabled={!cleanName}
            icon={Play}
            size="lg"
            className="w-full"
          >
            Create new room
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-bold text-copy-muted">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleJoin();
            }}
          >
            <InputField
              label="Room code"
              icon={Hash}
              tone="purple"
              placeholder="AB12CD"
              value={roomId}
              maxLength={12}
              onChange={(event) => setRoomId(event.target.value.toUpperCase())}
              className="uppercase"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={!cleanName || !cleanRoomId}
              size="lg"
              className="w-full"
            >
              Join room
            </Button>
          </form>
        </div>
      </Card>
    </Layout>
  );
}
