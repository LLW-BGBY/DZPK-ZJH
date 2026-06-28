const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { isAdmin: false };

  try {
    const res = await db.collection('admins').where({ openId: OPENID }).count();
    return { isAdmin: res.total > 0 };
  } catch (err) {
    console.error('checkAdmin error:', err);
    return { isAdmin: false };
  }
};
