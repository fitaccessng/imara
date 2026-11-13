import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from './auth.types';
import { AuthService } from './auth.service';
import { ChangePasswordDto, EmailDto, LoginDto, RegisterDto, ResetPasswordCodeDto, ResetPasswordDto, TokenDto, VerifyEmailCodeDto } from './dto';
import { SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookieOptions() {
    const sameSite = process.env.COOKIE_SAME_SITE
      ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
    return {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: (sameSite === 'none' ? 'none' : sameSite === 'strict' ? 'strict' : 'lax') as 'lax' | 'strict' | 'none',
      path: '/',
    };
  }

  private setSessionCookie(res: Response, session: { token: string; expiresAt: Date }) {
    const days = Number(process.env.SESSION_TTL_DAYS ?? 30);
    res.cookie(process.env.SESSION_COOKIE_NAME ?? 'imara_session', session.token, {
      ...this.cookieOptions(),
      maxAge: days * 86_400_000,
      expires: session.expiresAt,
    });
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, req.get('user-agent'));
    this.setSessionCookie(res, result);
    return { user: result.user, workspaceId: result.workspaceId };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.auth.sessionId);
    res.clearCookie(process.env.SESSION_COOKIE_NAME ?? 'imara_session', this.cookieOptions());
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() dto: TokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.verifyEmail(dto.token, req.get('user-agent'));
    this.setSessionCookie(res, result);
    return { user: result.user, workspaceId: result.workspaceId };
  }

  @Post('verify-email-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmailCode(
    @Body() dto: VerifyEmailCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyEmailCode(dto.email, dto.code, req.get('user-agent'));
    this.setSessionCookie(res, result);
    return { user: result.user, workspaceId: result.workspaceId };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resendVerification(@Body() dto: EmailDto) {
    await this.auth.resendVerification(dto.email);
    return { message: 'If the address needs verification, an email will be sent.' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(@Body() dto: EmailDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { message: 'If the address is registered, a reset email will be sent.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('reset-password-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPasswordCode(@Body() dto: ResetPasswordCodeDto) {
    await this.auth.resetPasswordWithCode(dto.email, dto.code, dto.password);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.getProfile(req.auth.userId);
  }

  @Post('change-password')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(req.auth.userId, dto.currentPassword, dto.newPassword);
    res.clearCookie(process.env.SESSION_COOKIE_NAME ?? 'imara_session', this.cookieOptions());
  }

  @Get('sessions')
  @UseGuards(SessionGuard)
  async sessions(@Req() req: AuthenticatedRequest) {
    return this.auth.listSessions(req.auth.userId, req.auth.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.revokeSession(req.auth.userId, id);
    if (id === req.auth.sessionId) {
      res.clearCookie(process.env.SESSION_COOKIE_NAME ?? 'imara_session', this.cookieOptions());
    }
  }
}
