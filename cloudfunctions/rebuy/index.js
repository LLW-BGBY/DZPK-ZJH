const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { roomId } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) return { success: false, error: '未登录' };
  if (!roomId) return { success: false, error: '房间ID无效' };

  const MAX_REBUY = 3;

  try {
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) return { success: false, error: '房间不存在' };

    const room = roomRes.data;
    if (room.status !== 'waiting' && room.status !== 'ended') {
      return { success: false, error: '只能在等待或结算阶段补充筹码' };
    }

    const playerIndex = room.players.findIndex(p => p.openId === OPENID);
    if (playerIndex === -1) return { success: false, error: '不在房间中' };

    const player = room.players[playerIndex];
    const rebuyCount = player.rebuyCount || 0;

    if (rebuyCount >= MAX_REBUY) {
      return { success: false, error: '本局重买次数已用完' };
    }

    if (player.chips > 0) {
      return { success: false, error: '还有筹码，无需重买' };
    }

    // 重买金额为初始筹码的一半
    const rebuyAmount = Math.floor(room.defaultChips / 2);
    const newChips = rebuyAmount;
    const newRebuyCount = rebuyCount + 1;

    // 更新指定玩家字段
    const updateKey = `players.${playerIndex}.chips`;
    const rebuyKey = `players.${playerIndex}.rebuyCount`;
    const hasRebuyKey = `players.${playerIndex}.hasRebuy`;

    await db.collection('rooms').doc(roomId).update({
      data: {
        [updateKey]: newChips,
        [rebuyKey]: newRebuyCount,
        [hasRebuyKey]: true,
        updatedAt: Date.now()
      }
    });

    return {
      success: true,
      chips: newChips,
      rebuyCount: newRebuyCount,
      message: `已补充 ${newChips} 筹码（${newRebuyCount}/${MAX_REBUY}）`
    };
  } catch (err) {
    console.error('rebuy error:', err);
    return { success: false, error: err.message };
  }
};