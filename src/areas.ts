import { areas as rawAreas } from './raw_areas';

// 将原始数据转换为以id为键的对象，方便查询
const areas = {};
rawAreas.forEach(area => {
  areas[area.id] = {
    name: area.name['zh-cn'],
    tier: area['tier-loot']
  };
});

export default areas;
