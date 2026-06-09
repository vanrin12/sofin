import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Permissions } from '@app/common';
import { CrmService } from './crm.service';
import { CreateContactDto, CreateDealDto, UpdateDealDto } from './dto';

@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Permissions('contact:read')
  @Get('contacts')
  listContacts() {
    return this.crm.listContacts();
  }

  @Permissions('contact:create')
  @Post('contacts')
  createContact(@Body() dto: CreateContactDto, @CurrentUser() user: AuthUser) {
    return this.crm.createContact(dto, user);
  }

  @Permissions('activity:read')
  @Get('contacts/:id/activities')
  activities(@Param('id') id: string) {
    return this.crm.activitiesFor(id);
  }

  @Permissions('deal:create')
  @Post('deals')
  createDeal(@Body() dto: CreateDealDto, @CurrentUser() user: AuthUser) {
    return this.crm.createDeal(dto, user);
  }

  @Permissions('deal:update')
  @Patch('deals/:id')
  updateDeal(@Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.crm.updateDeal(id, dto);
  }
}
