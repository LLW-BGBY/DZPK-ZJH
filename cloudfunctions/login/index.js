const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { OPENID, APPID } = cloud.getWXContext();
  const { nickName, avatarUrl } = event;

  try {
    const db = cloud.database();
    //  upsert 用户信息到 users 集合
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data && userRes.data.length > 0) {
      // 已存在，更新
      const updateData = {};
      if (nickName) updateData.nickName = nickName;
      if (avatarUrl) updateData.avatarUrl = avatarUrl;
      updateData.lastLoginAt = db.serverDate();
      await db.collection('users').doc(userRes.data[0]._id).update({ data: updateData });
    } else {
      // 不存在，插入
      await db.collection('users').add({
        data: {
          _openid: OPENID,
          nickName: nickName || '玩家',
          avatarUrl: avatarUrl || '',
          createdAt: db.serverDate(),
          lastLoginAt: db.serverDate()
        }
      });
    }
  } catch (e) {
    console.log('login: save user error', e.message);
  }

  return {
    openid: OPENID,
    appid: APPID
  };
};
