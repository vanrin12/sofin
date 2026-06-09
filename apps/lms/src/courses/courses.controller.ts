import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Permissions } from '@app/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto';

@Controller('lms')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Permissions('course:read')
  @Get('courses')
  list() {
    return this.courses.list();
  }

  @Permissions('course:create')
  @Post('courses')
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: AuthUser) {
    return this.courses.create(dto, user);
  }

  @Permissions('course:read')
  @Get('courses/:id')
  get(@Param('id') id: string) {
    return this.courses.get(id);
  }

  @Permissions('course:update')
  @Patch('courses/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto, @CurrentUser() user: AuthUser) {
    return this.courses.update(id, dto, user);
  }

  @Permissions('enrollment:create')
  @Post('courses/:id/enroll')
  enroll(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.courses.enroll(id, user, req.headers['x-request-id'] as string);
  }

  @Permissions('course:read')
  @Get('enrollments/me')
  myEnrollments(@CurrentUser() user: AuthUser) {
    return this.courses.myEnrollments(user.id);
  }
}
