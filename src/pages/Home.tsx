import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Play, User } from 'lucide-react';
import Layout from '../components/Layout';
import { Badge, Button, Card, GameLogo, InputField } from '../components/UI';
import { createRoom } from '../firebase/roomService';
import {
  consumeRoomExitNotice,
  getPendingJoinStorageKey,
  persistRoomPlayerId,
  persistPlayerName,
  PLAYER_NAME_MAX_LENGTH,
  sanitizePlayerName,
} from '../utils/playerIdentity';

export default function Home() {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [roomExitNotice, setRoomExitNotice] = useState('');
  const navigate = useNavigate();

  const cleanName = sanitizePlayerName(name);
  const cleanRoomId = roomId.trim().toUpperCase();

  useEffect(() => {
    const notice = consumeRoomExitNotice();
    if (notice) {
      setRoomExitNotice(notice);
    }
  }, []);

  const handleCreate = async () => {
    if (!cleanName) return;
    setLoading(true);
    try {
      const { roomId: id, playerId } = await createRoom(cleanName);
      persistPlayerName(cleanName);
      persistRoomPlayerId(id, playerId);
      navigate(`/room/${id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = () => {
    if (!cleanName || !cleanRoomId) return;
    persistPlayerName(cleanName);
    sessionStorage.setItem(getPendingJoinStorageKey(cleanRoomId), cleanName);
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
          {roomExitNotice ? (
            <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm font-semibold text-[#ffc0ca]">
              {roomExitNotice}
            </div>
          ) : null}

          <InputField
            label="Player name"
            icon={User}
            placeholder="Enter your name"
            value={name}
            maxLength={PLAYER_NAME_MAX_LENGTH}
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
