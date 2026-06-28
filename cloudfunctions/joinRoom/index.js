const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 与 createRoom 一致的密码哈希方式
function hashPassword(pwd) {
  if (!pwd) return '';
  const buf = Buffer.from(pwd + '_poker_salt', 'utf8');
  return buf.toString('base64');
}

exports.main = async (event, context) => {
  const { roomNumber, playerName, playerAvatar, password = '' } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, error: '未登录' };
  }

  try {
    const roomRes = await db.collection('rooms').where({ roomNumber }).get();
    if (!roomRes.data || roomRes.data.length === 0) {
      return { success: false, error: '房间不存在' };
    }

    const room = roomRes.data[0];
    const roomId = room._id;

    if (room.status !== 'waiting') {
      return { success: false, error: '游戏已开始，无法加入' };
    }

    if (room.players.length >= room.maxPlayers || room.maxPlayers > 16) {
      return { success: false, error: '房间已满' };
    }

    // 验证密码
    if (room.hasPassword) {
      const inputHash = hashPassword(password.trim());
      if (!password.trim() || inputHash !== room.passwordHash) {
        return { success: false, error: '房间密码错误' };
      }
    }

    const existingPlayer = room.players.find(p => p.openId === OPENID);
    if (existingPlayer) {
      return { success: true, roomId, gameType: room.gameType || 'texas', roomData: room, isRejoin: true };
    }

    const now = Date.now();
    const newPlayer = {
      openId: OPENID,
      name: playerName || '玩家' + (room.players.length + 1),
      avatarUrl: playerAvatar || '',
      isReady: false,
      isActive: true,
      isAllIn: false,
      hasActed: false,
      totalBetThisRound: 0,
      totalBet: 0,
      chips: room.defaultChips,
      holeCards: [],
      handResult: null,
      rebuyCount: 0,
      seat: room.players.length,
      joinedAt: now
    };

    await db.collection('rooms').doc(roomId).update({
      data: {
        players: _.push(newPlayer),
        updatedAt: now
      }
    });

    const updatedRoom = await db.collection('rooms').doc(roomId).get();
    return { success: true, roomId, gameType: room.gameType || 'texas', roomData: updatedRoom.data, isRejoin: false };
  } catch (err) {
    console.error('joinRoom error:', err);
    return { success: false, error: err.message };
  }
};