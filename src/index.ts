import { Context, Schema, h } from 'koishi'
import { getTzInfo } from './fetch'
import { system_prompt, itemAnalysisPrompt } from './prompts'

export const name = 'd2rtz'

export interface Config {
  apiUrl?: string
  ocrApiUrl: string
  ocrApiKey: string
  aiApiUrl: string
  aiApiKey: string
  aiModel: string
  mockMode: boolean
  testMode: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    apiUrl: Schema.string().description('API地址').default('https://api.d2-trade.com.cn/api/query/tz_online'),
  }).description('基础设置'),
  Schema.object({
    ocrApiUrl: Schema.string().description('OCR API地址').default('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'),
    ocrApiKey: Schema.string().description('OCR API密钥').role('secret'),
    aiApiUrl: Schema.string().description('AI API地址').default('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'),
    aiApiKey: Schema.string().description('AI API密钥').role('secret'),
    aiModel: Schema.string().description('AI模型名称').default('qwen-plus'),
    mockMode: Schema.boolean().description('是否启用Mock模式（用于本地测试）').default(false),
    testMode: Schema.boolean().description('是否启用测试模式（跳过OCR直接输入文本）').default(false)
  }).description('装备鉴定设置'),
])

// OCR识别函数
async function recognizeImage(ctx: Context, config: Config, imageUrl: string): Promise<{ success: boolean; text?: string; error?: string }> {
  ctx.logger.info(`开始OCR识别图片: ${imageUrl}`);

  // 如果启用了Mock模式，则返回预设的模拟数据
  if (config.mockMode) {
    ctx.logger.info('使用Mock模式进行OCR识别');
    
    // 模拟OCR识别延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 返回模拟的OCR识别结果
    return { 
      success: true, 
      text: `暗黑破坏神装备信息：
力量 +15
敏捷 +10
最大生命值 +20
防御 +50
等级需求 25
稀有度：魔法物品` 
    };
  }

  try {
    const response = await fetch(config.ocrApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.ocrApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "qwen-vl-ocr-2025-08-28",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              },
              {
                type: "text",
                text: "请仅输出图像中的文本内容。"
              }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      return { success: false, error: `OCR请求失败: ${response.status} ${response.statusText}` };
    }

    const result = await response.json();
    ctx.logger.info(`OCR识别结果: ${JSON.stringify(result)}`);

    // 提取OCR识别的文字内容
    // 这里需要根据实际OCR API的返回格式进行解析
    const ocrText = result.choices?.[0]?.message?.content || '无法提取OCR文本';

    return { success: true, text: ocrText };
  } catch (error) {
    return { success: false, error: `OCR识别出错: ${error.message}` };
  }
}

// 预处理OCR文本，过滤掉方括号内容
export function preprocessOcrText(ocrText: string): string {
  // 移除方括号和方头括号内的内容，但保留[ETH]无形的标记
  // 使用正则表达式匹配方括号和方头括号内容，但排除包含"ETH"的情况
  let processedText = ocrText
    // 移除包含金装前缀/后缀等信息的方括号内容，但保留[ETH]
    .replace(/\[(?!ETH\])[^\]]*\]/g, '')
    // 移除类似[290ED/6/6/4]这样的数值标识
    .replace(/\[\d+ED\/[\d\/]+\]/g, '')
    // 移除方头括号『』内的内容
    .replace(/『[^』]*』/g, '')
    // 移除缀:xxx这类修饰信息
    .replace(/缀[：:].*/g, '')
    // 移除前缀:xxx这类修饰信息
    .replace(/前缀[：:].*/g, '')
    // 清理多余的空白行
    .replace(/\n\s*\n/g, '\n')
    // 去除行首行尾空格
    .trim();

  // 分割文本为行数组
  const lines = processedText.split('\n');
  
  // 找到"需要等级"或"等级需求"所在行的索引
  let levelRequirementIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('需要等級') || lines[i].includes('等级需求') || lines[i].includes('Requires Level')) {
      levelRequirementIndex = i;
      break;
    }
  }

  // 如果找到了等级需求行，则保留前几行（装备名称）和从等级需求开始的后续行
  if (levelRequirementIndex !== -1) {
    // 保留前3行（通常是装备名称相关）和等级需求后的所有行
    const nameLines = lines.slice(0, Math.min(3, levelRequirementIndex));
    const propertyLines = lines.slice(levelRequirementIndex);
    return [...nameLines, ...propertyLines].join('\n').trim();
  }

  // 如果没有找到等级需求行，直接返回处理后的文本
  return processedText;
}

// AI分析函数
async function analyzeItem(ctx: Context, config: Config, ocrText: string): Promise<{ success: boolean; analysis?: string; error?: string }> {
  ctx.logger.info(`开始AI分析装备: ${ocrText}`);

  // 如果启用了Mock模式，则返回预设的模拟数据
  if (config.mockMode) {
    ctx.logger.info('使用Mock模式进行AI分析');
    
    // 模拟AI分析延迟
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 返回模拟的AI分析结果
    return { 
      success: true, 
      analysis: '这是一件中级魔法装备，属性较为普通。力量和敏捷的加成对近战职业有一定帮助，但整体属性并不突出。建议作为过渡装备使用，不建议长期保留。' 
    };
  }

  // 预处理OCR文本
  const processedText = preprocessOcrText(ocrText);
  ctx.logger.info(`预处理后的OCR文本: ${processedText}`);

  try {
    const prompt = itemAnalysisPrompt(processedText);

    const response = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: [
          { role: "system", content: system_prompt },
          { 
            role: "user", 
            content: prompt 
          }
        ],
        stream: false,
        enable_thinking: false
      }),
    });

    if (!response.ok) {
      return { success: false, error: `AI分析请求失败: ${response.status} ${response.statusText}` };
    }

    const result = await response.json();
    ctx.logger.info(`AI分析结果: ${JSON.stringify(result)}`);

    // 提取AI分析结果
    // 根据实际API返回格式进行解析
    const analysis = result.choices?.[0]?.message?.content || '无法获取AI分析结果';

    return { success: true, analysis };
  } catch (error) {
    return { success: false, error: `AI分析出错: ${error.message}` };
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.command('d2rtz')
    .action(async ({ session }) => {
      try {
        const info = await getTzInfo(config);
        return info;
      } catch (error) {
        return '获取TZ信息失败: ' + error.message;
      }
    })

  // 装备鉴定指令
  ctx.command('鉴定 <image:text>', '暗黑破坏神装备鉴定')
    .option('mock', '-m 使用Mock模式进行测试')
    .action(async ({ session }, image) => {
      // 测试模式下，直接使用输入的文本作为OCR结果
      if (config.testMode) {
        if (!image) {
          return '测试模式下，请直接输入OCR识别后的文本内容。';
        }
        
        ctx.logger.info(`测试模式：直接使用输入文本进行AI分析`);
        
        // 直接进入AI分析
        const analysisResult = await analyzeItem(ctx, config, image);
        
        if (!analysisResult.success) {
          return `装备价值分析失败: ${analysisResult.error}`;
        }
        
        // 返回结果
        return analysisResult.analysis;
      }
      
      let src = (h.select(image, 'img').map(item => item.attrs.src)[0] ||
        h.select(session.quote?.content, "img").map((a) => a.attrs.src)[0] ||
        h.select(session.quote?.content, "mface").map((a) => a.attrs.url)[0]);

      if (!src) {
        const [msgId] = await session.send(`请在30秒内发送装备截图`);
        const promptcontent = await session.prompt(30000);
        if (promptcontent !== undefined) {
          src = h.select(promptcontent, 'img')[0]?.attrs.src || h.select(promptcontent, 'mface')[0]?.attrs.url;
        }
        try {
          await session.bot.deleteMessage(session.channelId, msgId);
        } catch {
          ctx.logger.warn(`在频道 ${session.channelId} 尝试撤回消息ID ${msgId} 失败。`);
        }
      }

      if (!src) {
        return '未检测到有效的装备截图，请重新发送。';
      }

      ctx.logger.info(`用户发送的装备截图链接: ${src}`);

      // OCR识别
      const ocrResult = await recognizeImage(ctx, config, src);

      if (!ocrResult.success) {
        return `装备属性识别失败: ${ocrResult.error}`;
      }

      // AI分析
      const analysisResult = await analyzeItem(ctx, config, ocrResult.text);

      if (!analysisResult.success) {
        return `装备价值分析失败: ${analysisResult.error}`;
      }

      // 返回结果
      return analysisResult.analysis;
    });
}
