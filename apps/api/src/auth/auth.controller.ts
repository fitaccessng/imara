import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from './auth.types';
import { AuthService } from './auth.service';
import { getSessionConfig } from './session-config';
import { ChangePasswordDto, EmailDto, LoginDto, RegisterDto, ResetPasswordCodeDto, ResetPasswordDto, TokenDto, VerifyEmailCodeDto } from './dto';
import { SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookieOptions() {
    const config = getSessionConfig();
    return {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSameSite,
      path: '/',
    };
  }

  private setSessionCookie(res: Response, session: { token: string; expiresAt: Date }) {
    const { cookieName } = getSessionConfig();
    res.cookie(cookieName, session.token, {
      ...this.cookieOptions(),
      // The database session and browser cookie must expire at the same instant.
      // Supplying maxAge makes Express derive a second, response-time expiry.
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
    res.clearCookie(getSessionConfig().cookieName, this.cookieOptions());
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
    res.clearCookie(getSessionConfig().cookieName, this.cookieOptions());
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
      res.clearCookie(getSessionConfig().cookieName, this.cookieOptions());
    }
  }
}
