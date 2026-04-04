import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EffortLevel } from '@prisma/client';
import OpenAI from 'openai';
import { Observable } from 'rxjs';

import type { BundleLevelsDto } from '../common/schemas/shared';
import {
  daysBetween,
  getMonday,
  getTodayInTimezone,
  subtractDays,
} from '../common/utils/date.utils';
import { computeHealth } from '../common/utils/system-health.utils';
import { MomentumService } from '../momentum/momentum.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ApplySuggestionDto } from './dto/apply-suggestion.dto';
import type { CreateConversationDto } from './dto/create-conversation.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { SuggestActionsDto } from './dto/suggest-actions.dto';
import type { SuggestSystemsDto } from './dto/suggest-systems.dto';
import {
  buildSuggestActionsPrompt,
  buildSuggestSystemsPrompt,
  buildSystemPrompt,
  type UserContext,
} from './ai-coach.prompts';

const EFFORT_LEVELS: EffortLevel[] = ['baseline', 'normal', 'stretch'];

@Injectable()
export class AiCoachService {
  private readonly logger = new Logger(AiCoachService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly momentumService: MomentumService,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    this.model = this.configService.get<string>('AI_MODEL') ?? 'gpt-4o-mini';
  }

  // ─── Conversation CRUD ──────────────────────────────────

  async listConversations(clerkUserId: string) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    return this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createConversation(clerkUserId: string, dto: CreateConversationDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    return this.prisma.aiConversation.create({
      data: { userId, type: dto.type, title: dto.title },
    });
  }

  async getConversation(clerkUserId: string, conversationId: string) {
    const conversation = await this.findOwnedConversation(
      clerkUserId,
      conversationId,
    );

    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });

    return { ...conversation, messages };
  }

  async deleteConversation(clerkUserId: string, conversationId: string) {
    const conversation = await this.findOwnedConversation(
      clerkUserId,
      conversationId,
    );

    await this.prisma.aiConversation.delete({
      where: { id: conversation.id },
    });
  }

  // ─── Messaging ──────────────────────────────────────────

  async sendMessage(
    clerkUserId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    const conversation = await this.findOwnedConversation(
      clerkUserId,
      conversationId,
    );

    const userMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: dto.content,
      },
    });

    const chatMessages = await this.buildChatMessages(
      clerkUserId,
      conversation.id,
    );

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: chatMessages,
    });

    const assistantContent =
      completion.choices[0]?.message?.content ??
      'I could not generate a response.';

    const assistantMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantContent,
      },
    });

    await this.touchConversation(conversation.id);

    return { userMessage, assistantMessage };
  }

  streamResponse(
    clerkUserId: string,
    conversationId: string,
    messageId: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.executeStream(
        clerkUserId,
        conversationId,
        messageId,
        subscriber,
      ).catch((error) => {
        this.logger.error('Stream error', error);
        subscriber.error(error);
      });
    });
  }

  // ─── Suggestions ────────────────────────────────────────

  async suggestSystems(clerkUserId: string, dto: SuggestSystemsDto) {
    const userContext = await this.buildUserContext(clerkUserId);
    const prompt = buildSuggestSystemsPrompt(dto.goals, userContext);

    const responseContent = await this.callOpenAiJson(prompt);
    return this.parseSuggestions(responseContent);
  }

  async suggestActions(clerkUserId: string, dto: SuggestActionsDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const system = await this.prisma.system.findFirst({
      where: { id: dto.systemId, userId, deletedAt: null },
      include: {
        areas: {
          where: { deletedAt: null },
          select: { name: true },
        },
      },
    });
    if (!system) {
      throw new NotFoundException('System not found');
    }

    const areaNames = system.areas.map((area) => area.name);
    const userContext = await this.buildUserContext(clerkUserId);
    const prompt = buildSuggestActionsPrompt(
      system.name,
      areaNames,
      userContext,
      dto.context,
    );

    const responseContent = await this.callOpenAiJson(prompt);
    return this.parseSuggestions(responseContent);
  }

  // ─── Apply Suggestion ───────────────────────────────────

  async applySuggestion(clerkUserId: string, dto: ApplySuggestionDto) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    if (dto.type === 'system') {
      return this.applySystemSuggestion(userId, dto.system);
    }
    return this.applyBundleSuggestion(userId, dto.bundle);
  }

  private async applySystemSuggestion(
    userId: string,
    systemData: Extract<ApplySuggestionDto, { type: 'system' }>['system'],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const system = await tx.system.create({
        data: {
          userId,
          name: systemData.name,
          icon: systemData.icon,
          replacedHabit: systemData.replacedHabit,
        },
      });

      const createdAreas = await Promise.all(
        systemData.areas.map(async (areaData) => {
          const area = await tx.area.create({
            data: { systemId: system.id, name: areaData.name },
          });

          const createdBundles = await Promise.all(
            areaData.bundles.map((bundleLevels) =>
              this.createBundleWithActions(tx, area.id, bundleLevels),
            ),
          );

          return { ...area, bundles: createdBundles };
        }),
      );

      return { ...system, areas: createdAreas };
    });
  }

  private async applyBundleSuggestion(
    userId: string,
    bundleData: Extract<ApplySuggestionDto, { type: 'bundle' }>['bundle'],
  ) {
    const area = await this.prisma.area.findFirst({
      where: {
        id: bundleData.areaId,
        deletedAt: null,
        system: { userId, deletedAt: null },
      },
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }

    return this.createBundleWithActions(this.prisma, area.id, bundleData);
  }

  // ─── Private: OpenAI helpers ────────────────────────────

  private async buildChatMessages(clerkUserId: string, conversationId: string) {
    const userContext = await this.buildUserContext(clerkUserId);
    const systemPrompt = buildSystemPrompt(userContext);
    const history = await this.getConversationHistory(conversationId);

    return [{ role: 'system' as const, content: systemPrompt }, ...history];
  }

  private async executeStream(
    clerkUserId: string,
    conversationId: string,
    messageId: string,
    subscriber: {
      next: (value: MessageEvent) => void;
      complete: () => void;
    },
  ) {
    const conversation = await this.findOwnedConversation(
      clerkUserId,
      conversationId,
    );

    const pendingMessage = await this.prisma.aiMessage.findFirst({
      where: { id: messageId, conversationId: conversation.id },
    });
    if (!pendingMessage) {
      throw new NotFoundException('Message not found');
    }

    const chatMessages = await this.buildChatMessages(
      clerkUserId,
      conversation.id,
    );

    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages: chatMessages,
      stream: true,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullContent += token;
        subscriber.next({
          data: JSON.stringify({ token }),
        } as MessageEvent);
      }
    }

    await this.prisma.aiMessage.update({
      where: { id: messageId },
      data: { content: fullContent },
    });

    await this.touchConversation(conversation.id);

    subscriber.next({
      data: JSON.stringify({ messageId }),
      type: 'done',
    } as MessageEvent);

    subscriber.complete();
  }

  private async callOpenAiJson(prompt: string): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return completion.choices[0]?.message?.content ?? '{"suggestions":[]}';
  }

  // ─── Private: Prisma helpers ────────────────────────────

  private createBundleWithActions(
    client:
      | PrismaService
      | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    areaId: string,
    levels: BundleLevelsDto,
  ) {
    return client.actionBundle.create({
      data: {
        areaId,
        bundleTitle: levels.bundleTitle,
        actions: {
          create: EFFORT_LEVELS.map((effortLevel) => ({
            title: levels[effortLevel].title,
            effortLevel,
            anchor: levels[effortLevel].anchor,
          })),
        },
      },
      include: { actions: true },
    });
  }

  private touchConversation(conversationId: string) {
    return this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  // ─── Private: User context assembly ─────────────────────

  private async buildUserContext(clerkUserId: string): Promise<UserContext> {
    const user = await this.prisma.userProfile.findUnique({
      where: { clerkUserId },
      select: { id: true, userName: true, timezone: true },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const today = getTodayInTimezone(user.timezone);
    const mondayOfWeek = getMonday(today);
    const fourteenDaysAgo = subtractDays(today, 14);

    const [systems, recentCheckins, streak, weeklyMomentum] = await Promise.all(
      [
        this.fetchSystemsWithDetails(user.id),
        this.fetchRecentCheckins(user.id, fourteenDaysAgo),
        this.momentumService.calculateStreak(user.id, user.timezone),
        this.momentumService.calculateWeeklyMomentum(user.id, mondayOfWeek),
      ],
    );

    return {
      userName: user.userName,
      systems: systems.map((system) => this.mapSystemToContext(system)),
      streak,
      weeklyMomentum,
      systemHealth: systems.map((system) =>
        this.mapSystemToHealth(system, today),
      ),
      recentCheckins: recentCheckins.map((checkin) => ({
        date: checkin.date,
        systemName: checkin.system.name,
        actionTitle: checkin.action.title,
        effortLevel: checkin.energyLevel,
      })),
    };
  }

  private fetchSystemsWithDetails(userId: string) {
    return this.prisma.system.findMany({
      where: { userId, deletedAt: null },
      include: {
        areas: {
          where: { deletedAt: null },
          include: {
            bundles: {
              where: { deletedAt: null },
              include: {
                actions: {
                  where: { deletedAt: null },
                  select: { title: true, effortLevel: true },
                },
              },
            },
          },
        },
        checkins: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { date: true },
        },
      },
    });
  }

  private fetchRecentCheckins(userId: string, sinceDate: string) {
    return this.prisma.checkin.findMany({
      where: {
        system: { userId, deletedAt: null },
        date: { gte: sinceDate },
      },
      select: {
        date: true,
        energyLevel: true,
        action: { select: { title: true } },
        system: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private mapSystemToContext(
    system: Awaited<ReturnType<typeof this.fetchSystemsWithDetails>>[number],
  ) {
    return {
      id: system.id,
      name: system.name,
      icon: system.icon,
      areas: system.areas.map((area) => ({
        name: area.name,
        bundles: area.bundles.map((bundle) => ({
          bundleTitle: bundle.bundleTitle,
          baseline: this.findActionTitle(bundle.actions, 'baseline'),
          normal: this.findActionTitle(bundle.actions, 'normal'),
          stretch: this.findActionTitle(bundle.actions, 'stretch'),
        })),
      })),
    };
  }

  private mapSystemToHealth(
    system: Awaited<ReturnType<typeof this.fetchSystemsWithDetails>>[number],
    today: string,
  ) {
    const lastCheckinDate = system.checkins[0]?.date;
    const { healthStatus } = computeHealth(lastCheckinDate, today);

    return {
      systemName: system.name,
      status: healthStatus,
      daysSinceLastCheckin: lastCheckinDate
        ? daysBetween(lastCheckinDate, today)
        : null,
    };
  }

  private findActionTitle(
    actions: Array<{ title: string; effortLevel: EffortLevel }>,
    level: EffortLevel,
  ): string {
    return actions.find((action) => action.effortLevel === level)?.title ?? '';
  }

  // ─── Private: Shared utilities ──────────────────────────

  private async getConversationHistory(conversationId: string) {
    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    return messages.map((message) => ({
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
    }));
  }

  private async resolveUser(clerkUserId: string) {
    const user = await this.prisma.userProfile.findUnique({
      where: { clerkUserId },
      select: { id: true, timezone: true },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  private async findOwnedConversation(
    clerkUserId: string,
    conversationId: string,
  ) {
    const { id: userId } = await this.resolveUser(clerkUserId);

    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private parseSuggestions(responseContent: string): unknown[] {
    const parsed = this.safeJsonParse(responseContent);
    const suggestions = (parsed as Record<string, unknown>)?.suggestions;

    if (Array.isArray(suggestions)) return suggestions;
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  }

  private safeJsonParse(text: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      this.logger.warn('Failed to parse AI suggestion response');
      throw new BadRequestException(
        'AI returned an invalid response. Please try again.',
      );
    }
  }
}
